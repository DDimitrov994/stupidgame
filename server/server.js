const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { config } = require('./config');

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

// Game state management
let matchmakingQueue = [];
let matches = [];

// Helper Functions
const GAME_SETTINGS = {
    circleRadius: 40,
    canvasWidth: 800,
    canvasHeight: 600,
};

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
    };
}

// Handle player actions
function handlePlayerAction(action, gameState) {
    const source = gameState.circles.find((c) => c.id === action.source);
    const target = gameState.circles.find((c) => c.id === action.target);

    if (!source || !target) {
        console.log('Invalid attack: source or target circle not found.');
        return;
    }

    if (source.playerId !== action.playerId) {
        console.log('Invalid attack: player does not own the source circle.');
        return;
    }

    if (source.units >= action.units) {
        source.units -= action.units;
        createMovingDots(source, target, action.units, gameState.movingDots);
    } else {
        console.log('Invalid attack: insufficient units.');
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

// Start game loop
function startGameLoop(matchId, gameState) {
    const interval = setInterval(() => {
        gameState.circles.forEach((circle) => {
            if (circle.isPlayer) {
                circle.units += 1;
            }
        });

        const match = matches.find((m) => m.id === matchId);
        if (match) {
            match.players.forEach((player) => player.socket.emit('update_game', gameState));
        }
    }, 1000);
}

// Handle movement
function handleMovement(matchId, gameState) {
    const interval = setInterval(() => {
        gameState.movingDots.forEach((dot) => {
            const source = gameState.circles.find((c) => c.id === dot.sourceId);
            const target = gameState.circles.find((c) => c.id === dot.targetId);

            if (source && target) {
                const distance = Math.sqrt(
                    Math.pow(target.x - source.x, 2) + Math.pow(target.y - source.y, 2)
                );

                if (dot.progress < dot.waveProgress) {
                    dot.progress += 0.1;
                    return;
                }

                const adjustedProgress = dot.progress - dot.waveProgress;

                if (adjustedProgress < 1) {
                    dot.progress += (100 / distance) * 0.01;
                }

                if (dot.progress >= 1 + dot.waveProgress) {
                    resolveBattle(dot, gameState);
                }
            }
        });

        gameState.movingDots = gameState.movingDots.filter((dot) => dot.progress < 1 + dot.waveProgress);

        const match = matches.find((m) => m.id === matchId);
        if (match) {
            match.players.forEach((player) => player.socket.emit('update_game', gameState));
        }
    }, 10);
}

// Matchmaking
io.on('connection', (socket) => {
    console.log(`Player connected: ${socket.id}`);

    socket.on('find_game', (playerData) => {
        matchmakingQueue.push({ socket, playerData });

        if (matchmakingQueue.length >= 2) {
            const [player1, player2] = matchmakingQueue.splice(0, 2);
            const matchId = `match_${Date.now()}`;
            const gameState = initializeGameState(player1.playerData, player2.playerData);

            matches.push({ id: matchId, players: [player1, player2], gameState });

            player1.socket.emit('match_found', { matchId, player: 1 });
            player2.socket.emit('match_found', { matchId, player: 2 });

            startGameLoop(matchId, gameState);
            handleMovement(matchId, gameState);
        }
    });

    socket.on('player_action', (action) => {
        const match = matches.find((m) => m.players.some((p) => p.socket.id === socket.id));
        if (match) {
            handlePlayerAction(action, match.gameState);
        }
    });

    socket.on('disconnect', () => {
        const match = matches.find((m) => m.players.some((p) => p.socket.id === socket.id));

        if (match) {
            const remainingPlayer = match.players.find((p) => p.socket.id !== socket.id);
            if (remainingPlayer) {
                remainingPlayer.socket.emit('game_over', { winner: remainingPlayer.playerData.name });
            }
            matches = matches.filter((m) => m.id !== match.id);
        }

        matchmakingQueue = matchmakingQueue.filter((p) => p.socket.id !== socket.id);
    });
});

// Start server
const PORT = process.env.PORT || 80;
server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
