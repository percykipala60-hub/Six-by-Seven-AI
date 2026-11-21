import { buildApp } from './app.js';
import { loadEnv } from './env.js';
async function main() {
    const env = loadEnv();
    const app = await buildApp(env);
    const shutdown = async (signal) => {
        app.log.info(`Arrêt demandé (${signal})`);
        await app.close();
        process.exit(0);
    };
    process.once('SIGINT', () => void shutdown('SIGINT'));
    process.once('SIGTERM', () => void shutdown('SIGTERM'));
    await app.listen({ host: env.HOST, port: env.PORT });
}
main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
});
//# sourceMappingURL=server.js.map