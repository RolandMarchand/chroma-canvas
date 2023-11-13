## Laz's Place
### Overview

This project is a simplified version of the popular r/Place platform, allowing users to collaboratively create a shared canvas by placing pixels on a grid. It is a fun and interactive way for users to express their creativity and build a collaborative digital artwork.

### Features
- **Pixel Placement:** Users can place pixels on a shared canvas.
- **Real-Time Updates:** Changes are reflected in real-time for all connected users.
- **Grid Interaction:** Users can interact with a grid-based canvas.
- **Color Palette:** Choose from a predefined color palette for pixel placement.

### Technologies Used

- Frontend:
  - HTML, CSS, JavaScript
- Backend:
  - [Go](https://go.dev/) - An open-source programming language supported by Google
  - [Gin](https://pkg.go.dev/github.com/gin-gonic/gin) - Go web framework
  - [Gorilla WebSocket](https://pkg.go.dev/github.com/gorilla/websocket) - WebSocket library for Go
  - [Redis](https://redis.io/docs/connect/clients/go/) - The open source, in-memory database, cache, streaming engine, and message broker.
  - [Go Redis](https://pkg.go.dev/github.com/go-redis/redis/v8) - Golang Redis client for Redis Server and Redis Cluster

### Usage

1. Open the application in your web browser at [lazarusoverlook.com/place](https://lazarusoverlook.com/place/).
2. Choose a color from the palette.
3. Click on the canvas to place pixels collaboratively with other users.

### Environment Variables

- `REDIS_USERNAME` defaults to nothing
- `REDIS_PASSWORD` defaults to nothing
- `REDIS_DATABASE` defaults to 0
- `REDIS_ADDRESS` defaults to `localhost:6379`
- `PLACE_RELEASE_BUILD` has 2 values: `release` and anything else is considered `debug`
- `PLACE_PORT` defaults to 37372

### Contributing

Contributions are welcome! If you have suggestions or improvements, please open an issue or create a pull request.

### License

This project is licensed under the BSD0 License.
