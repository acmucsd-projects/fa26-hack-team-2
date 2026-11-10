require("dotenv").config({ quiet: true });

const app = require("./app");
const { connectDB } = require("./config/db");

const PORT = process.env.PORT || 3001;

// Connect to MongoDB first so the server never accepts requests it can't serve.
connectDB()
    .then((connection) => {
        console.log(`Connected to MongoDB database "${connection.name}"`);
        app.listen(PORT, () => {
            console.log(`Backend running at http://localhost:${PORT}`);
        });
    })
    .catch((err) => {
        console.error("Failed to connect to MongoDB:", err.message);
        process.exit(1);
    });
