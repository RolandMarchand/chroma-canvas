package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
	"github.com/redis/go-redis/v9"
	"log"
	"net/http"
	"os"
	"strconv"
	"sync"
	"time"
)

type database struct {
	client  *redis.Client
	context context.Context
}

func getDatabaseConnection() database {
	password := os.Getenv("REDIS_PASSWORD")
	username := os.Getenv("REDIS_USERNAME")
	db, _ := strconv.Atoi(os.Getenv("REDIS_DATABASE"))
	addr := os.Getenv("REDIS_ADDRESS")
	if addr == "" {
		addr = "localhost:6379"
	}

	ret := database{
		client: redis.NewClient(&redis.Options{
			Addr:     addr,
			Password: password,
			Username: username,
			DB:       db,
		}),
		context: context.Background(),
	}
	_, err := ret.client.Ping(ret.context).Result()
	if err != nil {
		panic(err)
	}
	return ret
}

func middleware(c *gin.Context) {
	c.Header("Access-Control-Allow-Origin", "*")
	c.Header("Access-Control-Allow-Methods", "GET, OPTIONS")
	c.Header("Access-Control-Allow-Headers", "Content-Type, Authorization")
	c.Header("Access-Control-Allow-Credentials", "true")
	if c.Request.Method == "OPTIONS" {
		c.AbortWithStatus(http.StatusOK)
		return
	}
	c.Next()
}

var (
	postUrl = os.Getenv("PLACE_POST_PIXEL_URL")
	postEnabled = len(postUrl) > 0
	clients     = make(map[*websocket.Conn]chan pixelData)
	broadcast   = make(chan pixelData)
	clientMutex sync.Mutex
	upgrader    = websocket.Upgrader{
		ReadBufferSize:  1024,
		WriteBufferSize: 1024,
		CheckOrigin: func(r *http.Request) bool {
			return true
		},
	}
)

const maxPixelRows = 1024
const maxPixelColumns = 1024
const colorDefault = "#D9D3D9"

type pixelData struct {
	X     string `json:"x"`
	Y     string `json:"y"`
	Color string `json:"color"`
	UserId string `json:"userId"`
}

const getTimeout time.Duration = 5 * time.Second
const setTimeout time.Duration = 20 * time.Second

func startSetTimeout(ip *string, db *database) {
	now, _ := time.Now().MarshalText()
	db.client.Set(db.context, "set_timeout:"+*ip, now, setTimeout)
}

func startGetTimeout(ip *string, db *database) {
	now, _ := time.Now().MarshalText()
	db.client.Set(db.context, "get_timeout:"+*ip, now, getTimeout)
}

func approveSetRequest(ip *string, db *database) (approved bool, timeLeft time.Duration) {
	data, err := db.client.Get(db.context, "set_timeout:"+*ip).Result()
	// Timeouts in Redis are set to expire
	if err == redis.Nil {
		return true, 0 // expired
	}
	if err != nil {
		panic(err)
	}
	since, _ := time.Parse(time.RFC3339, data)
	return false, setTimeout - time.Since(since)
}

func approveGetRequest(ip *string, db *database) (approved bool, timeLeft time.Duration) {
	data, err := db.client.Get(db.context, "get_timeout:"+*ip).Result()
	// Timeouts in Redis are set to expire
	if err == redis.Nil {
		return true, 0 // expired
	}
	if err != nil {
		panic(err)
	}
	since, _ := time.Parse(time.RFC3339, data)
	return false, getTimeout - time.Since(since)
}

func getPixels(db *database, columns, rows int) [][]string {
	ret := make([][]string, columns)
	for x := 0; x < columns; x++ {
		ret[x] = make([]string, rows)
		for y := 0; y < rows; y++ {
			key := strconv.Itoa(x) + "x" + strconv.Itoa(y)
			color, err := db.client.Get(db.context, key).Result()
			if err == redis.Nil {
				ret[x][y] = colorDefault
			} else if err != nil {
				panic(err)
			} else {
				ret[x][y] = color
			}
		}
	}
	return ret
}

func denyPixelPlacement(conn *websocket.Conn, ip *string) error {
	// Notify the client of the limit
	seconds := fmt.Sprintf("%.0f", setTimeout.Seconds())
	msg := "rate limit exceeded of 1 request per " +
		seconds + " seconds"
	data, _ := json.Marshal(map[string]string{
		"Error": msg,
	})
	log.Println("Notice: ", ip, string(msg))
	err := conn.WriteMessage(websocket.TextMessage, data)
	return err
}

func allowPixelPlacement(conn *websocket.Conn, db *database, ip *string, pixel pixelData) error {
	log.Printf("debug: from %s: %v\n", *ip, pixel)
	key := pixel.X + "x" + pixel.Y

	startSetTimeout(ip, db)
	err := db.client.Set(db.context, key, pixel.Color, 0).Err()
	if err != nil {
		panic(err)
	}

	broadcast <- pixel

	// Notify the client of the expected wait time
	data, _ := json.Marshal(map[string]float64{
		"waitSeconds": setTimeout.Seconds(),
	})
	return conn.WriteMessage(websocket.TextMessage, data)
}

func marshalPayload(conn *websocket.Conn, payload []byte, pixel *pixelData) (success bool, err error) {
	if err = json.Unmarshal(payload, &pixel); err != nil {
		log.Println("Warning: invalid payload: ", err)
		data, _ := json.Marshal(map[string]string{
			"Error": "Badly formed payload",
		})
		success, err = false, conn.WriteMessage(websocket.TextMessage, data)
		return
	}
	success, err = true, nil
	return
}

func postNotification(pixel pixelData) {
	data, err := json.Marshal(&pixel)
	if err != nil {
		panic(err)
	}
	res, err := http.Post(postUrl, "application/json", bytes.NewBuffer(data))
	if err != nil {
		panic(err);
	}
	defer res.Body.Close()
	type body struct {
		Error string
		Message string
	}
	var b body
	err = json.NewDecoder(res.Body).Decode(&b)
	if err != nil {
		panic(err)
	}
	if res.StatusCode == http.StatusOK {
		log.Println("debug: "+ b.Message)
	} else {
		log.Println("Warning: "+ b.Error)
	}
}

func handleWebSocketConnection(conn *websocket.Conn, db *database, ip *string) {
	type WebSocketMessage struct {
		Type    int
		Payload []byte
		Err     error
	}
	var wg sync.WaitGroup
	message := make(chan WebSocketMessage)
	read := func() {
		defer wg.Done()
		wg.Add(1)
		var msg WebSocketMessage
		msg.Type, msg.Payload, msg.Err = conn.ReadMessage()
		message <- msg
	}

	defer conn.Close()
	defer wg.Wait()
	defer close(message)
	defer clientMutex.Unlock()
	defer delete(clients, conn)
	defer clientMutex.Lock()

	var pixel pixelData
	clientMutex.Lock()
	broadcastedSignal := clients[conn]
	clientMutex.Unlock()
	go read()

	for {
		select {
		case pixel = <-broadcastedSignal:
			err := conn.WriteJSON(pixel)
			if err != nil {
				log.Println("Warning: ", err)
				return
			}
		case msg := <-message:
			// Applications must break out of the read loop when
			// this method returns a non-nil error value
			if msg.Err != nil {
				log.Println("Warning: ", msg.Err)
				return
			}
			if msg.Type == websocket.CloseMessage {
				log.Println("Notice: ", ip, ": received closed message")
				return
			}

			success, err := marshalPayload(conn, msg.Payload, &pixel)
			if err != nil {
				log.Println("Warning: ", msg.Err)
				return
			}
			if !success {
				read()
				continue
			}

			// Enforce the 1 pixel per setTimeout rule
			if approved, _ := approveSetRequest(ip, db); !approved {
				err := denyPixelPlacement(conn, ip)
				if err != nil {
					log.Println("Warning: ", err)
					return
				}
				go read()
				continue
			}

			if postEnabled {
				go postNotification(pixel)
			}

			err = allowPixelPlacement(conn, db, ip, pixel)
			if err != nil {
				log.Println("Warning: ", err)
				return
			}
			go read()
		}
	}
}

func handleBroadcast() {
	for {
		pixel := <-broadcast

		clientsCpy := make(map[*websocket.Conn]chan pixelData)
		clientMutex.Lock()
		for key, value := range clients {
			clientsCpy[key] = value
		}
		clientMutex.Unlock()

		for client, channel := range clientsCpy {
			log.Printf("debug: to %s: %v\n",
				client.LocalAddr().String(), pixel)
			channel <- pixel
		}
	}
}

func createWebSocket(c *gin.Context, db *database) {
	conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		log.Println("Error: ", err)
		c.JSON(http.StatusInternalServerError,
			gin.H{"error": err.Error()})
		return
	}

	clientMutex.Lock()
	clients[conn] = make(chan pixelData)
	clientMutex.Unlock()

	ip := c.ClientIP()
	go handleWebSocketConnection(conn, db, &ip)
}

func checkGridDimensions(c *gin.Context) (rows, columns int, approved bool) {
	columns, err := strconv.Atoi(c.Query("columns"))
	if err != nil {
		log.Println("Warning: bad request: " + c.Query("columns"))
		c.AbortWithStatus(http.StatusBadRequest)
		approved = false
		return
	}
	rows, err = strconv.Atoi(c.Query("rows"))
	if err != nil {
		log.Println("Warning: bad request: " + c.Query("rows"))
		c.AbortWithStatus(http.StatusBadRequest)
		approved = false
		return
	}
	if columns > maxPixelColumns {
		log.Println("Notice: ", c.ClientIP(),
			": request entity too large: ",
			"request columns ", columns,
			" is over max allowed of ", maxPixelColumns)
		c.AbortWithStatus(http.StatusRequestEntityTooLarge)
		approved = false
		return
	}
	if rows > maxPixelRows {
		log.Println("Notice: ", c.ClientIP(),
			": request entity too large: ",
			"request rows ", rows,
			" is over max allowed of ", maxPixelRows)
		c.AbortWithStatus(http.StatusRequestEntityTooLarge)
		approved = false
		return
	}
	approved = true
	return
}

func main() {
	db := getDatabaseConnection()
	defer db.client.Close()

	var debugMode bool = os.Getenv("PLACE_DEBUG_ENABLED") != ""
	if !debugMode {
		gin.SetMode(gin.ReleaseMode)
	}
	r := gin.Default()
	r.SetTrustedProxies(nil)
	r.Use(middleware)
	r.GET("/ws", func(c *gin.Context) {
		createWebSocket(c, &db)
	})
	r.GET("/", func(c *gin.Context) {
		ip := c.ClientIP()
		if approved, timeLeft := approveGetRequest(&ip, &db); !approved {
			log.Println("Notice: ", ip, ": too many requests")
			data :=map[string]interface{}{
				"retryAfter":	timeLeft.Milliseconds(),
				"message":	"Too many requests. Please try again later.",
			}
			c.AbortWithStatusJSON(http.StatusTooManyRequests, data)
			return
		}

		columns, rows, approved := checkGridDimensions(c)
		if !approved {
			return
		}

		pixels := getPixels(&db, columns, rows)
		_, timeLeft := approveSetRequest(&ip, &db)
		data := map[string]interface{}{
			"pixels":   pixels,
			"timeLeft": timeLeft.Seconds(),
		}
		c.JSON(http.StatusOK, data)
		// Forbid GET spam
		startGetTimeout(&ip, &db)
	})
	go handleBroadcast()

	port := os.Getenv("PLACE_PORT")
	if port == "" {
		log.Println("Info: default port 37372 chosen.")
		port = "37372"
	}
	if os.Getenv("PLACE_HTTPS_DISABLED") != "" {
		r.Run(":" + port)
	} else {
		cert := os.Getenv("PLACE_TLS_CERT_FILE_PATH")
		key := os.Getenv("PLACE_TLS_KEY_FILE_PATH")
		if cert == "" {
			cert = "fullchain.pem"
			log.Println("Info: no default TLS certificate found, using default ", cert)
		}
		if key == "" {
			cert = "privkey.pem"
			log.Println("Info: no default TLS key found, using default ", cert)
		}
		r.RunTLS(":"+port, cert, key)
	}
}
