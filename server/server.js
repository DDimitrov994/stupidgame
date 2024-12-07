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
app.use(express.static('client'));
// Default route to serve index.html for any unknown routes
app.get('*', (req, res) => {
    res.sendFile(__dirname + '/client/index.html');
});
let matchmakingQueue = [];
let matches = [];

io.on('connection', (socket) => {
    console.log(`Player connected: ${socket.id}`);

    socket.on('find_game', (playerData) => {
        console.log(`Player ${playerData.name} searching for a game.`);
        matchmakingQueue.push({ socket, playerData });

        if (matchmakingQueue.length >= 2) {
            const [player1, player2] = matchmakingQueue.splice(0, 2);

            const matchId = `match_${Date.now()}`;
            const gameState = initializeGameState(player1.playerData, player2.playerData);

            matches.push({ id: matchId, players: [player1, player2], gameState });

            player1.socket.emit('match_found', { matchId, player: 1 });
            player2.socket.emit('match_found', { matchId, player: 2 });

            console.log(`Match created: ${matchId}`);
            startGameLoop(matchId, gameState);
            handleMovement(matchId,gameState);
        }
    });

    socket.on('player_action', (action) => {
        const match = findMatch(socket.id);
        if (match) {
            handlePlayerAction(action, match.gameState, match.id);
        }
    });

    socket.on('disconnect', () => {
        console.log(`Player disconnected: ${socket.id}`);
        const match = findMatch(socket.id);

        if (match) {
            const remainingPlayer = match.players.find((p) => p.socket.id !== socket.id);
            if (remainingPlayer) {
                remainingPlayer.socket.emit('game_over', { winner: remainingPlayer.playerData.name });
                console.log(`Player ${remainingPlayer.playerData.name} is declared the winner.`);
            }
            matches = matches.filter((m) => m.id !== match.id);
        }

        matchmakingQueue = matchmakingQueue.filter((p) => p.socket.id !== socket.id);
    });
});

function initializeGameState(player1, player2) {
    const radius = 40; // Circle radius
    const circleDiameter = radius * 2;

    // Array to hold all placed circles to check for overlap
    const allCircles = [];

    // Helper function to generate random positions
    function getRandomPosition() {
        return {
            x: Math.random() * (800 - 2 * radius) + radius, // Ensure circle stays within bounds
            y: Math.random() * (600 - 2 * radius) + radius
        };
    }

    // Helper function to check minimum distance
    function isValidPosition(newCircle) {
        return allCircles.every(
            (existingCircle) =>
                Math.sqrt(
                    Math.pow(existingCircle.x - newCircle.x, 2) +
                    Math.pow(existingCircle.y - newCircle.y, 2)
                ) >= circleDiameter
        );
    }

    // Generate random positions for player circles
    function placePlayerCircle(player, color, id) {
        let position;
        do {
            position = getRandomPosition();
        } while (!isValidPosition(position));

        const circle = {
            id: id,
            x: position.x,
            y: position.y,
            units: 10,
            isPlayer: true,
            player: player.name,
            color: player.color,
            playerId: player.id
        };

        allCircles.push(circle); // Add to all circles to enforce distance
        return circle;
    }

    const player1Circle = placePlayerCircle(player1, player1.color, 'p1');
    const player2Circle = placePlayerCircle(player2, player2.color, 'p2');

    // Generate random positions for neutral circles
    const neutralCircles = generateNeutralCircles(config.neutralCircleRange, allCircles, circleDiameter);

    return {
        circles: [player1Circle, player2Circle, ...neutralCircles],
        movingDots: [],
    };
}

function generateNeutralCircles(range, allCircles, circleDiameter) {
    const numCircles = Math.floor(Math.random() * (range[1] - range[0] + 1)) + range[0];
    const radius = 40; // Circle radius
    const neutralCircles = [];

    function getRandomPosition() {
        return {
            x: Math.random() * (800 - 2 * radius) + radius,
            y: Math.random() * (600 - 2 * radius) + radius
        };
    }

    function isValidPosition(newCircle) {
        return allCircles.every(
            (existingCircle) =>
                Math.sqrt(
                    Math.pow(existingCircle.x - newCircle.x, 2) +
                    Math.pow(existingCircle.y - newCircle.y, 2)
                ) >= circleDiameter
        );
    }

    for (let i = 0; i < numCircles; i++) {
        let position;
        do {
            position = getRandomPosition();
        } while (!isValidPosition(position));

        const neutralCircle = {
            id: `n${i}`,
            x: position.x,
            y: position.y,
            units: Math.floor(Math.random() * config.neutralStartingUnits.max) + config.neutralStartingUnits.min,
            isPlayer: false,
            playerId: null
        };

        allCircles.push(neutralCircle); // Add to all circles to enforce distance
        neutralCircles.push(neutralCircle);
    }

    return neutralCircles;
}

function handlePlayerAction(action, gameState, matchId) {
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
        console.log(`Attack initiated from ${source.id} to ${target.id} with ${action.units} units`);

        source.units -= action.units;

        const dots = [];
        let remainingUnits = action.units;
        let waveIndex = 0;

        // Create moving dots with ownership, color, and player data
        while (remainingUnits > 0) {
            const dotsInWave = Math.min(remainingUnits, Math.floor(Math.random() * 8) + 3); // 3-10 dots per wave
            remainingUnits -= dotsInWave;

            for (let i = 0; i < dotsInWave; i++) {
                dots.push({
                    sourceId: source.id,
                    targetId: target.id,
                    progress: 0,
                    waveProgress: waveIndex * 0.5, // Add delay between waves
                    units: 1,
                    offsetX: (Math.random() - 0.5) * 20, // Randomized offset for clustering
                    offsetY: (Math.random() - 0.5) * 20,
                    playerId: source.playerId, // Track the original owner
                    color: source.color,       // Track the original color
                    player: source.player      // Track the original player name
                });
            }

            waveIndex++; // Increment wave index for the next set of dots
        }

        // Add generated dots to the game state
        gameState.movingDots.push(...dots);

        console.log('Generated Moving Dots:', dots);

        // Broadcast updated game state
        const match = matches.find((m) => m.id === matchId);
        if (match) {
            match.players.forEach((player) => player.socket.emit('update_game', gameState));
        }
    } else {
        console.log('Invalid attack: insufficient units.');
    }
}


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
function handleMovement(matchId, gameState) {
    const dotSpeed = 100; // Speed of dots in pixels per second
    const interval = setInterval(() => {
        gameState.movingDots.forEach((dot) => {
            const source = gameState.circles.find((c) => c.id === dot.sourceId);
            const target = gameState.circles.find((c) => c.id === dot.targetId);

            if (source && target) {
                const distance = Math.sqrt(
                    Math.pow(target.x - source.x, 2) + Math.pow(target.y - source.y, 2)
                );

                // Increment progress only after wave delay
                if (dot.progress < dot.waveProgress) {
                    dot.progress += 0.1; // Increment only for delay simulation
                    return; // Skip movement until delay is over
                }

                const adjustedProgress = dot.progress - dot.waveProgress;

                // Increment progress based on speed and distance
                if (adjustedProgress < 1) {
                    dot.progress += (dotSpeed / distance) * 0.01;
                }

                // Trigger battle resolution when the dot reaches its target
                if (dot.progress >= 1 + dot.waveProgress) {
                    resolveBattle(dot, gameState);
                }
            }
        });

        // Remove completed dots
        gameState.movingDots = gameState.movingDots.filter((dot) => dot.progress < 1 + dot.waveProgress);

        // Broadcast updated game state
        const match = matches.find((m) => m.id === matchId);
        if (match) {
            match.players.forEach((player) => player.socket.emit('update_game', gameState));
        }
    }, 10); // Update every 10ms
}

function resolveBattle(dot, gameState) {
    const target = gameState.circles.find((c) => c.id === dot.targetId);

    console.log(`Resolving battle for dot: Target ${dot.targetId}, Units: ${dot.units}, Owner: ${dot.playerId}`);

    if (dot.playerId === target.playerId) {
        console.log(`Transferring units: ${dot.units} to ${target.id}`);
        target.units += dot.units;
    } else {
        if (dot.units > target.units) {
            console.log(`Dot owner ${dot.playerId} conquers ${target.id}`);
            target.isPlayer = true;
            target.playerId = dot.playerId; // Use the dot's owner for new ownership
            target.units = dot.units - target.units;

            // Update color and player directly from the dot
            target.color = dot.color;
            target.player = dot.player;
        } else {
            target.units -= dot.units;
        }
    }

    console.log('Updated Target Circle:', target);
}


function findMatch(socketId) {
    return matches.find((m) => m.players.some((p) => p.socket.id === socketId));
}

const PORT = process.env.PORT || 80; // Use PORT environment variable or default to 80
server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});