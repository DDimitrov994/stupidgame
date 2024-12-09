// Updated server.js with player image handling
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { config } = require('./config');
const { match } = require('assert');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "https://stupidgame.onrender.com",
        methods: ["GET", "POST"],
    },
});

// Serve static files
app.use(express.static('client'));
app.get('*', (req, res) => {
    res.sendFile(__dirname + '/client/index.html');
});
app.use('/assets', express.static('assets'));

// Game state management
let matchmakingQueue = [];
const matches = new Map(); // Use Map for faster match lookups
const playerImages = {}; // Map to store player images by playerId

// Helper Functions
const GAME_SETTINGS = {
    circleRadius: 40,
    canvasWidth: 800,
    canvasHeight: 600,
    unitIncrementInterval: 1000, // Increment units every second
    dotUpdateInterval: 10,      // Update dot movement every 10ms
};
let lastUnitIncrementTime = Date.now();

setInterval(() => {
    const currentTime = Date.now();
    const timeSinceLastIncrement = currentTime - lastUnitIncrementTime;

    matches.forEach(({ gameState, players, id }) => {
        // Increment units only if 1000ms have passed
        if (timeSinceLastIncrement >= 1000) {
            gameState.circles.forEach((circle) => {
                if (circle.isPlayer) {
                    circle.units += 1;
                }
            });

            // Update the last increment time
            lastUnitIncrementTime = currentTime;
        }

        // Update dots movement
        updateDots(gameState);

        // Broadcast game state
        players.forEach((player) => player.socket.emit('update_game', gameState));

        // Check for win conditions
        checkWinConditions(id, gameState, players);
    });
}, GAME_SETTINGS.dotUpdateInterval);

// Helper to generate random positions
function getRandomPosition(radius) {
    return {
        x: Math.random() * (GAME_SETTINGS.canvasWidth - 2 * radius) + radius,
        y: Math.random() * (GAME_SETTINGS.canvasHeight - 2 * radius) + radius,
    };
}

// Helper to validate circle placement
function isValidPosition(newCircle, allCircles, circleDiameter) {
    return allCircles.every(
        (existingCircle) =>
            Math.sqrt(
                Math.pow(existingCircle.x - newCircle.x, 2) +
                Math.pow(existingCircle.y - newCircle.y, 2)
            ) >= circleDiameter
    );
}

// Create a player circle
function createPlayerCircle(player, id, allCircles, circleDiameter) {
    let position;
    do {
        position = getRandomPosition(GAME_SETTINGS.circleRadius);
    } while (!isValidPosition(position, allCircles, circleDiameter));

    const circle = {
        id,
        x: position.x,
        y: position.y,
        units: 10,
        isPlayer: true,
        player: player.name,
        color: player.color,
        playerId: player.id,
    };

    allCircles.push(circle);
    return circle;
}

// Generate neutral circles
function generateNeutralCircles(range, allCircles, circleDiameter) {
    const numCircles = Math.floor(Math.random() * (range[1] - range[0] + 1)) + range[0];
    const neutralCircles = [];

    for (let i = 0; i < numCircles; i++) {
        let position;
        do {
            position = getRandomPosition(GAME_SETTINGS.circleRadius);
        } while (!isValidPosition(position, allCircles, circleDiameter));

        const circle = {
            id: `n${i}`,
            x: position.x,
            y: position.y,
            units: Math.floor(Math.random() * config.neutralStartingUnits.max) + config.neutralStartingUnits.min,
            isPlayer: false,
            playerId: null,
        };

        allCircles.push(circle);
        neutralCircles.push(circle);
    }

    return neutralCircles;
}

// Initialize game state
function initializeGameState(player1, player2) {
    const radius = GAME_SETTINGS.circleRadius;
    const circleDiameter = radius * 2;
    const allCircles = [];

    const playerCircles = [
        createPlayerCircle(player1, 'p1', allCircles, circleDiameter),
        createPlayerCircle(player2, 'p2', allCircles, circleDiameter),
    ];

    const neutralCircles = generateNeutralCircles(config.neutralCircleRange, allCircles, circleDiameter);

    return {
        circles: [...playerCircles, ...neutralCircles],
        movingDots: [],
        playerImages: {
            [player1.id]: player1.selectedImage,
            [player2.id]: player2.selectedImage,
        },
    };
}

// Handle player actions
function handlePlayerAction(action, gameState) {
    const source = gameState.circles.find((c) => c.id === action.source);
    const target = gameState.circles.find((c) => c.id === action.target);

    if (!source || !target) {
        console.error('Invalid attack: source or target circle not found.');
        return;
    }

    if (source.playerId !== action.playerId) {
        console.error('Invalid attack: player does not own the source circle.');
        return;
    }

    if (source.units >= action.units) {
        source.units -= action.units;
        createMovingDots(source, target, action.units, gameState.movingDots);
    } else {
        console.error('Invalid attack: insufficient units.');
    }
}

// Create moving dots for an attack
function createMovingDots(source, target, units, movingDots) {
    let remainingUnits = units;
    let waveIndex = 0;

    while (remainingUnits > 0) {
        const dotsInWave = Math.min(remainingUnits, Math.floor(Math.random() * 8) + 3); // 3-10 dots per wave
        remainingUnits -= dotsInWave;

        for (let i = 0; i < dotsInWave; i++) {
            movingDots.push({
                sourceId: source.id,
                targetId: target.id,
                progress: 0,
                waveProgress: waveIndex * 0.5,
                units: 1,
                offsetX: (Math.random() - 0.5) * 20,
                offsetY: (Math.random() - 0.5) * 20,
                playerId: source.playerId,
                color: source.color,
                player: source.player,
            });
        }

        waveIndex++;
    }
}

// Update dots movement
function updateDots(gameState) {
    gameState.movingDots.forEach((dot) => {
        const source = gameState.circles.find((c) => c.id === dot.sourceId);
        const target = gameState.circles.find((c) => c.id === dot.targetId);

        if (source && target) {
            const angle = Math.atan2(target.y - source.y, target.x - source.x);
            const targetEdgeX = target.x - GAME_SETTINGS.circleRadius * Math.cos(angle);
            const targetEdgeY = target.y - GAME_SETTINGS.circleRadius * Math.sin(angle);

            const distanceToTargetEdge = Math.sqrt(
                Math.pow(targetEdgeX - dot.x, 2) + Math.pow(targetEdgeY - dot.y, 2)
            );

            if (dot.progress < dot.waveProgress) {
                dot.progress += 0.1; // Pause for wave delay
                return;
            }

            const speed = 100 / distanceToTargetEdge * 0.01;

            if (distanceToTargetEdge > 0) {
                dot.x += (targetEdgeX - dot.x) * speed;
                dot.y += (targetEdgeY - dot.y) * speed;
            }

            if (distanceToTargetEdge <= GAME_SETTINGS.circleRadius * 0.1) {
                resolveBattle(dot, gameState);
            }
        }
    });

    // Remove completed dots
    gameState.movingDots = gameState.movingDots.filter((dot) => dot.progress < 1);
}

// Handle resolving battles
function resolveBattle(dot, gameState) {
    const target = gameState.circles.find((c) => c.id === dot.targetId);

    if (dot.playerId === target.playerId) {
        target.units += dot.units;
    } else if (dot.units > target.units) {
        target.isPlayer = true;
        target.playerId = dot.playerId;
        target.units = dot.units - target.units;
        target.color = dot.color;
        target.player = dot.player;
    } else {
        target.units -= dot.units;
    }
}

// Check win conditions
function checkWinConditions(matchId, gameState, players) {
    const playerStats = {};

    // Collect stats
    gameState.circles.forEach((circle) => {
        if (circle.playerId != null) {
            if (!playerStats[circle.playerId]) {
                playerStats[circle.playerId] = { circles: 0, dots: 0 };
            }
            playerStats[circle.playerId].circles++;
        }
    });

    gameState.movingDots.forEach((dot) => {
        if (dot.playerId != null) {
            if (!playerStats[dot.playerId]) {
                playerStats[dot.playerId] = { circles: 0, dots: 0 };
            }
            playerStats[dot.playerId].dots++;
        }
    });

    // Determine if a player has won
    const remainingPlayers = Object.entries(playerStats).filter(
        ([, stats]) => stats.circles > 0 || stats.dots > 0
    );
    if (remainingPlayers.length === 1) {
        console.log('remainingPlayers.length === 1');
        console.log(remainingPlayers);
        const winnerId = remainingPlayers[0][0];
        const winner = players.find((p) => p.playerData.id === winnerId);
        console.log('Game over; Winner: ');
        console.log(winner.playerData);
        if (winner) {
            players.forEach((player) => player.socket.emit('game_over', { winner: winner.playerData.name }));
        }

        matches.delete(matchId); // Remove the match
    }
}

// Matchmaking
io.on('connection', (socket) => {
    console.log(`Player connected: ${socket.id}`);

    socket.on('find_game', (playerData) => {
        // Save player image
        playerImages[playerData.id] = playerData.selectedImage;

        matchmakingQueue.push({ socket, playerData });

        if (matchmakingQueue.length >= 2) {
            const [player1, player2] = matchmakingQueue.splice(0, 2);
            const matchId = `match_${Date.now()}`;
            const gameState = initializeGameState(player1.playerData, player2.playerData);

            matches.set(matchId, { id: matchId, players: [player1, player2], gameState });

            player1.socket.emit('match_found', { matchId, player: 1 });
            player2.socket.emit('match_found', { matchId, player: 2 });
        }
    });

    socket.on('player_action', (action) => {
        const match = [...matches.values()].find((m) =>
            m.players.some((p) => p.socket.id === socket.id)
        );
        if (match) {
            handlePlayerAction(action, match.gameState);
        }
    });

    socket.on('disconnect', () => {
        console.log(`Player disconnected: ${socket.id}`);
        console.log('Total matches:' + matches.length);
        console.log('Players in queue: ' + matchmakingQueue.length);
        const match = [...matches.values()].find((m) =>
            m.players.some((p) => p.socket.id === socket.id)
        );

        if (match) {
            const remainingPlayer = match.players.find((p) => p.socket.id !== socket.id);
            if (remainingPlayer) {
                remainingPlayer.socket.emit('game_over', { winner: remainingPlayer.playerData.name });
            }
            matches.delete(match.id);
        }

        matchmakingQueue = matchmakingQueue.filter((p) => p.socket.id !== socket.id);
    });
});

// Start server
const PORT = process.env.PORT || 80;
server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
