// Vercel serverless adapter — imports the Express app and exports it
// as the default handler so Vercel can invoke it as a function.
import app from '../server/index.js';
export default app;
