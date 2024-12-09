export function gameLoop(ctx, circles, deltaTime) {
    // Clear the canvas
    
    // Update and draw all circles
    circles.forEach((circle) => {
        circle.update(deltaTime);
        circle.draw(ctx);
    });
}
