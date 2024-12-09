export function gameLoop(ctx, circles, deltaTime,backgroundImage) {
    // Clear the canvas
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.drawImage(backgroundImage, 0, 0, ctx.canvas.width, ctx.canvas.height);
    // Update and draw all circles
    circles.forEach((circle) => {
        circle.update(deltaTime);
        circle.draw(ctx);
    });
}
