
require("dotenv").config({ path: require("path").join(__dirname, "backend/.env") });
const { sessionMiddleware } = require("./backend/config/sessionConfig");
const express = require('express');
const path = require('path');
const { checkDatabaseHealth } = require('./backend/BLL/healthService');
const authRoutes = require('./backend/PL/routes/authRoutes');
const aiRoutes = require('./backend/PL/routes/aiRoutes');
const aiPageRoutes = require(
    "./backend/PL/routes/aiPageRoutes"
);

const app = express();

app.set("view engine", "ejs");

app.set(
    "views",
    path.join(__dirname, "frontend/views")
);

app.use(
    "/assets",
    express.static(path.join(__dirname, "frontend/public"))
);

const port = process.env.PORT || 1337;

// Middleware
app.use(express.json());

app.use(sessionMiddleware);

app.use("/customer", aiPageRoutes);

// Authentication routes
app.use('/api/auth', authRoutes);

app.use('/api/ai', aiRoutes);

// Check whether Express is running
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        message: 'CortexOps API is running'
    });
});

// Check whether MySQL is connected
app.get('/api/db-health', async (req, res) => {
    try {
        await checkDatabaseHealth();

        res.json({
            status: 'ok',
            database: 'connected'
        });
    } catch (err) {
        console.error('Database error:', err);

        res.status(503).json({
            status: 'error',
            database: 'unavailable'
        });
    }
});

// Start server
app.listen(port, '0.0.0.0', () => {
    console.log(`CortexOps API running on port ${port}`);
});