import { Client } from "@heroiclabs/nakama-js";

const client = new Client("defaultkey", "127.0.0.1", "7350");
client.timeout = 5000;

client.ssl = false;

export const createSession = async (username: any) => {
  const session = await client.authenticateCustom(username);
  return session;
};

export default client;
