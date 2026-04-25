export default {
  name: "ping",
  async execute(context) {
    const start = Date.now();
    await context.reply(`🏓 Pong\nLatencia local: ${Date.now() - start}ms`);
  }
};
