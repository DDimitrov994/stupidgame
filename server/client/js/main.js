import { Circle } from './circle.js';
import { gameLoop } from './gameLoop.js';

const socket = io(window.location.origin);
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

let circles = [];
let dragging = false;
let sourceCircle = null;
let movingDots = []; // Store moving dots for animation
// Function to generate a unique player ID
function generatePlayerId() {
    return `player_${Math.random().toString(36).substr(2, 9)}`;
}

// Initialize player data
let playerData = {
    id: localStorage.getItem('playerId') || generatePlayerId(),
    name: localStorage.getItem('playerName') || 'Player',
    color: localStorage.getItem('playerColor') || '#0000ff',
};

// Save player data to local storage
localStorage.setItem('playerId', playerData.id);
localStorage.setItem('playerName', playerData.name);
localStorage.setItem('playerColor', playerData.color);
// Prefill the form fields with stored values
document.getElementById('player-name').value = playerData.name;
document.getElementById('player-color').value = playerData.color;
// Update player data when fields change
document.getElementById('player-name').addEventListener('input', (e) => {
    playerData.name = e.target.value || 'Player';
    localStorage.setItem('playerName', playerData.name);
});
document.getElementById('player-color').addEventListener('input', (e) => {
    playerData.color = e.target.value;
    localStorage.setItem('playerColor', playerData.color);
});

// Matchmaking and game initialization
document.getElementById('find-game').addEventListener('click', () => {
    

    document.getElementById('game-menu').style.display = 'none';
    document.getElementById('loading-screen').style.display = 'block';

    socket.emit('find_game', playerData);

    socket.on('match_found', () => {
        console.log('Match found! Waiting for game updates...');
        document.getElementById('loading-screen').style.display = 'none';
        document.getElementById('gameCanvas').style.display = 'block';
    });

    socket.on('update_game', (gameState) => {
        // Update circles from server
        circles = gameState.circles.map(
            (circle) =>
                new Circle(
                    circle.id, // Pass id property
                    circle.x,
                    circle.y,
                    circle.units,
                    circle.isPlayer,
                    circle.player || '',
                    circle.color || 'gray',
                    circle.playerId
                )
        );

        movingDots = gameState.movingDots.map((dot) => {
            const source = circles.find((c) => c.id === dot.sourceId);
            const target = circles.find((c) => c.id === dot.targetId);
    
            if (!source || !target) {
                console.error(`Source or target not found for dot:`, dot);
            }
    
            return {
                ...dot,
                source, // Resolve source Circle object
                target, // Resolve target Circle object
                offsetX: dot.offsetX || 0, // Ensure offsetX is defined
                offsetY: dot.offsetY || 0  // Ensure offsetY is defined
            };
        });
    });

    socket.on('game_over', (data) => {
        alert(`Game Over! Winner: ${data.winner}`);
        window.location.reload();
    });
});


canvas.addEventListener('mousedown', (e) => {
    const { offsetX, offsetY } = e;

    // Check if a circle is selected as the source
    sourceCircle = circles.find((circle) => {
        const dx = circle.x - offsetX;
        const dy = circle.y - offsetY;
        return (
            Math.sqrt(dx * dx + dy * dy) < 40 &&
            circle.isPlayer && // Must be a player-controlled circle
            circle.playerId === playerData.id // Must belong to the current player
        );
    });

    if (sourceCircle) {
        console.log('Source circle selected:', sourceCircle);
        dragging = true;
    } else {
        console.log('No valid source circle found or not owned by this player.');
    }
});



canvas.addEventListener('mouseup', (e) => {
    if (dragging && sourceCircle) {
        const { offsetX, offsetY } = e;

        // Find the target circle
        const targetCircle = circles.find((circle) => {
            const dx = circle.x - offsetX;
            const dy = circle.y - offsetY;
            return Math.sqrt(dx * dx + dy * dy) < 40 && circle !== sourceCircle;
        });

        if (targetCircle) {
            console.log('Target circle selected:', targetCircle);
            sendAttack(sourceCircle, targetCircle, sourceCircle.units);
        } else {
            console.log('No valid target circle found.');
        }
    } else {
        console.log('No source circle selected or dragging not initiated.');
    }

    dragging = false;
    sourceCircle = null;
});

function sendAttack(sourceCircle, targetCircle, units) {
    if (!sourceCircle || !targetCircle) {
        console.error('Invalid attack: source or target circle is undefined');
        return;
    }

    if (units > 0) {
        console.log('Sending attack:', { source: sourceCircle.id, target: targetCircle.id, units });
        socket.emit('player_action', {
            type: 'attack',
            playerId: playerData.id, // Include the player's ID
            source: sourceCircle.id,
            target: targetCircle.id,
            units,
        });
    } else {
        console.log('Attack aborted: No units to send');
    }
}
function renderMovingDots() {
    movingDots.forEach((dot) => {
        const { source, target, progress, color, offsetX, offsetY } = dot;

        if (source && target) {
            // Adjust progress for wave delay
            const adjustedProgress = Math.max(progress - dot.waveProgress, 0);

            // Calculate the dot's position along the path
            const x = source.x + (target.x - source.x) * Math.min(1, adjustedProgress) + offsetX;
            const y = source.y + (target.y - source.y) * Math.min(1, adjustedProgress) + offsetY;

            // Draw the dot
            ctx.beginPath();
            ctx.arc(x, y, 3, 0, Math.PI * 2);
            ctx.fillStyle = color || 'white'; // Default to white
            ctx.fill();
        } else {
            console.error('Invalid dot source or target:', dot);
        }
    });
}


// Game loop for rendering
let lastTime = 0;
function loop(timestamp) {
    const deltaTime = (timestamp - lastTime) / 1000;
    lastTime = timestamp;

    // Clear canvas and render game state
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    gameLoop(ctx, circles, deltaTime);

    // Render moving dots
    renderMovingDots();

    requestAnimationFrame(loop);
}

requestAnimationFrame(loop);
