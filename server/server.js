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

    const neutralCircles = generateNeutralCircles(config.neutralCircleRange);
    console.log('Player1: ' + player1.Id);
    return {
        circles: [
            { id: 'p1', x: radius + 50, y: 300, units: 10, isPlayer: true, player: player1.name, color: player1.color,playerId:player1.id },
            { id: 'p2', x: 800 - radius - 50, y: 300, units: 10, isPlayer: true, player: player2.name, color: player2.color,playerId:player2.id },
            ...neutralCircles,
        ],
        movingDots: [],
    };
}

function generateNeutralCircles(range) {
    const numCircles = Math.floor(Math.random() * (range[1] - range[0] + 1)) + range[0];
    const radius = 40; // Circle radius

    return Array.from({ length: numCircles }, (_, i) => ({
        id: `n${i}`,
        x: Math.random() * (800 - 2 * radius) + radius,
        y: Math.random() * (600 - 2 * radius) + radius,
        units: Math.floor(Math.random() * config.neutralStartingUnits.max) + config.neutralStartingUnits.min,
        isPlayer: false,
        playerId:null
    }));
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

        // Create moving dots with clustering and wave behavior
        while (remainingUnits > 0) {
            const dotsInWave = Math.min(remainingUnits, Math.floor(Math.random() * 8) + 3); // 3-10 dots per wave
            remainingUnits -= dotsInWave;

            for (let i = 0; i < dotsInWave; i++) {
                dots.push({
                    sourceId: source.id,
                    targetId: target.id,
                    progress: 0,
                    waveProgress: waveIndex * 0.5, // Add delay between waves (e.g., 0.5 per wave)
                    units: 1,
                    offsetX: (Math.random() - 0.5) * 20, // Randomized offset for clustering
                    offsetY: (Math.random() - 0.5) * 20,
                    playerId: source.playerId // Track the original owner of the dot
                });
            }

            waveIndex++; // Increment wave index for the next set of dots
        }

        // Add generated dots to the game state
        gameState.movingDots.push(...dots);

        // Debugging log to confirm dots are properly initialized
        console.log('Generated Moving Dots with Ownership:', dots);

        // Broadcast updated game state to all players in the match
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
                    dot.progress += 0.1; // Increment only to simulate delay
                    return; // Skip further movement until delay is over
                }

                // Adjust progress to account for wave delay
                const adjustedProgress = dot.progress - dot.waveProgress;

                // Increment progress based on speed and distance
                if (adjustedProgress < 1) {
                    dot.progress += (dotSpeed / distance) * 0.01;
                }

                // Check if the dot has reached its target
                if (dot.progress >= 1 + dot.waveProgress) {
                    resolveBattle(dot, gameState); // Trigger battle when truly complete
                }
            }
        });

        // Remove completed dots
        gameState.movingDots = gameState.movingDots.filter((dot) => dot.progress < 1 + dot.waveProgress);

        // Broadcast the updated game state
        const match = matches.find((m) => m.id === matchId);
        if (match) {
            match.players.forEach((player) => player.socket.emit('update_game', gameState));
        }
    }, 10); // Update every 10ms
}

function resolveBattle(dot, gameState) {
    const source = gameState.circles.find((c) => c.id === dot.sourceId);
    const target = gameState.circles.find((c) => c.id === dot.targetId);

    console.log(`Resolving battle for dot: Source ${dot.sourceId}, Target ${dot.targetId}, Units: ${dot.units}`);

    if (dot.playerId === target.playerId) {
        console.log(`Transferring units: ${dot.units} from ${source.id} to ${target.id}`);
        target.units += dot.units; // Add units to the target circle
    } else {
        if (dot.units > target.units) {
            target.isPlayer = true;
            target.player = gameState.circles.find((c) => c.id === dot.sourceId).player;
            target.color = gameState.circles.find((c) => c.id === dot.sourceId).color;
            target.playerId = dot.playerId; // Use the dot's playerId to assign ownership
            target.units = dot.units - target.units;
        } else {
            target.units -= dot.units;
        }
    }
}


function findMatch(socketId) {
    return matches.find((m) => m.players.some((p) => p.socket.id === socketId));
}

const PORT = process.env.PORT || 80; // Use PORT environment variable or default to 80
server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});