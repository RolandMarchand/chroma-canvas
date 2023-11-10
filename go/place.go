package main

import (
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

type Database struct {
	client *redis.Client
	context context.Context
}

func getDatabaseConnection() Database {
	Password := os.Getenv("REDIS_PASSWORD")
	Username := os.Getenv("REDIS_USERNAME")
	db := Database{
		client: redis.NewClient(&redis.Options{
			Addr: "lazarusoverlook.com:6379",
			Password: Password,
			Username: Username,
			DB: 0,
		}),
		context: context.Background(),
	}
	_, err := db.client.Ping(db.context).Result()
	if err != nil {
		panic(err)
	}
	return db
}

func Middleware(c *gin.Context) {
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
	clients = make(map[*websocket.Conn]bool)
	broadcast = make(chan PixelData)
	clientMutex sync.Mutex
	connectedClients = make(map[string]*websocket.Conn)
	upgrader = websocket.Upgrader{
		ReadBufferSize:  1024,
		WriteBufferSize: 1024,
		CheckOrigin: func(r *http.Request) bool {
			return true
		},
	}
)

const PIXELS_ROWS = 32
const PIXELS_COLUMNS = 32
const COLOR_DEFAULT = "#FFFFFF"

type PixelData struct {
	X string `json:"x"`
	Y string `json:"y"`
	Color string `json:"color"`
}

const GET_TIMEOUT time.Duration = 10 * time.Millisecond
const SET_TIMEOUT time.Duration = 20 * time.Second

func startSetTimeout(ip *string, db *Database) {
	now, _ := time.Now().MarshalText()
	db.client.Set(db.context, "set_timeout:" + *ip, now, SET_TIMEOUT)
}

func startGetTimeout(ip *string, db *Database) {
	now, _ := time.Now().MarshalText()
	db.client.Set(db.context, "get_timeout:" + *ip, now, GET_TIMEOUT)
}

func approveSetRequest(ip *string, db *Database) (bool, time.Duration) {
	data, err := db.client.Get(db.context, "set_timeout:" + *ip).Result()
	// Timeouts in Redis are set to expire
	if err == redis.Nil {
		return true, 0 // expired
	}
	if err != nil {
		panic(err)
	}
	since, _ := time.Parse(time.RFC3339, data)
	return false, SET_TIMEOUT - time.Since(since)
}

func approveGetRequest(ip *string, db *Database) (bool, time.Duration) {
	data, err := db.client.Get(db.context, "get_timeout:" + *ip).Result()
	// Timeouts in Redis are set to expire
	if err == redis.Nil {
		return true, 0 // expired
	}
	if err != nil {
		panic(err)
	}
	since, _ := time.Parse(time.RFC3339, data)
	return false, GET_TIMEOUT - time.Since(since)
}

func getPixels(db *Database) *[PIXELS_COLUMNS][PIXELS_ROWS]string {
	var ret [PIXELS_COLUMNS][PIXELS_ROWS]string
	for x := 0; x < PIXELS_COLUMNS; x++ {
		for y := 0; y < PIXELS_ROWS; y++ {
			key := strconv.Itoa(x) + "x" + strconv.Itoa(y)
			color, err := db.client.Get(db.context, key).Result()
			if err == redis.Nil {
				ret[y][x] = COLOR_DEFAULT
			} else if err != nil {
				panic(err)
			} else {
				ret[y][x] = color
			}
		}
	}
	return &ret;
}

func handleWebSocketConnection(conn *websocket.Conn, db *Database, ip *string) {
	for {
		defer delete(clients, conn)
		defer conn.Close()
		var pixel PixelData
		messageType, p, err := conn.ReadMessage()

		// Bad message, drop socket
		if err != nil {
			log.Println("Warning: ", err)
			return
		}
		// Bye bye
		if messageType == websocket.CloseMessage {
			log.Println("Notice: ", ip, ": received closed message")
			return
		}

		if err = json.Unmarshal(p, &pixel); err != nil {
			panic(err)
		}

		// Enforce the 1 pixel per SET_TIMEOUT rule
		if approved, _ := approveSetRequest(ip, db); !approved {
			// Notify the client of the limit
			seconds := fmt.Sprintf("%.0f", SET_TIMEOUT.Seconds())
			msg := "rate limit exceeded of 1 request per " + seconds + " seconds"
			data, _ := json.Marshal(map[string]string{"error": msg})
			err := conn.WriteMessage(websocket.TextMessage, data)

			log.Println("Notice: ", ip, string(msg))
			if err != nil {
				log.Println("Warning: ", err)
			}
			// Do not handle request
			continue
		}

		log.Printf("debug: from %s: %v\n", *ip, pixel)
		broadcast <- pixel
		key := pixel.X + "x" + pixel.Y

		clientMutex.Lock()
		startSetTimeout(ip, db)
		err = db.client.Set(db.context, key, pixel.Color, 0).Err()
		clientMutex.Unlock()

		if err != nil {
			panic(err)
		}

		// Notify the client of the expected wait time
		data, _ := json.Marshal(map[string]float64{"waitSeconds": SET_TIMEOUT.Seconds()})
		conn.WriteMessage(websocket.TextMessage, data)
	}
}

func handleBroadcast() {
	for {
		pixel := <- broadcast
		for client := range clients {
			log.Printf("debug: to %s: %v\n", client.LocalAddr().String(), pixel)
			err := client.WriteJSON(pixel)
			if err != nil {
				log.Println("Warning: connection closed: ", err)
				client.Close()
				delete(clients, client)
			}
		}
	}
}

func main() {
	db := getDatabaseConnection()
	defer db.client.Close()

	gin.SetMode(gin.ReleaseMode)
	//	r := gin.New()
	r := gin.Default()
	r.SetTrustedProxies(nil)
	r.Use(Middleware)
	r.GET("/ws", func(c *gin.Context) {
		conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
		if err != nil {
			log.Println("error: ", err)
			c.JSON(http.StatusInternalServerError,
				gin.H{"error": err.Error()})
			return
		}

		clients[conn] = true
		// using Gin's IP format for consistency
		ip := c.ClientIP()
		go handleWebSocketConnection(conn, &db, &ip)
	})
	r.GET("/", func(c *gin.Context) {
		ip := c.ClientIP()
		
		if approved, _ := approveGetRequest(&ip, &db); !approved {
			log.Println("Notice: ", ip, ": too many requests")
			c.AbortWithStatus(http.StatusTooManyRequests)
			return
		}
		pixels := getPixels(&db)
		_, timeLeft := approveSetRequest(&ip, &db)
		data, _ := json.Marshal(map[string]interface{}{
			"pixels": pixels,
			"timeLeft": timeLeft.Seconds(),
		})
		c.Data(http.StatusOK, "application/json", data)
		// Forbid GET spam
		startGetTimeout(&ip, &db)
	})
	go handleBroadcast()
	Port := os.Getenv("PLACE_PORT")
	r.RunTLS(":" + Port, "fullchain.pem", "privkey.pem")
}
