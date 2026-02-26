import mqtt, { IClientOptions, MqttClient } from "mqtt";
import { presenceService } from "./presence.service";

export class MqttService {
    private client: MqttClient | null = null;

    private readonly subscribedTopics = new Set<string>();

    constructor(
        private readonly brokerUrl: string = process.env.MQTT_BROKER_URL ?? "mqtt://localhost:1883",
        private readonly options: IClientOptions = {},
    ) { }

    async connect(): Promise<void> {
        if (this.client?.connected) {
            return;
        }

        if (!this.client) {
            this.client = mqtt.connect(this.brokerUrl, {
                reconnectPeriod: 1_000,
                ...this.options,
            });
        }

        await this.waitForConnect();
    }

    async publish(
        topic: string,
        payload: unknown,
        options?: { qos?: 0 | 1 | 2; retain?: boolean },
    ): Promise<void> {
        this.assertValidTopic(topic);

        const client = await this.ensureConnectedClient();
        const message = JSON.stringify(payload);

        await new Promise<void>((resolve, reject) => {
            client.publish(
                topic,
                message,
                {
                    qos: options?.qos ?? 0,
                    retain: options?.retain ?? false,
                },
                (error?: Error) => {
                    if (error) {
                        reject(error);
                        return;
                    }

                    resolve();
                },
            );
        });
    }

    async subscribe(topic: string): Promise<void> {
        this.assertValidTopic(topic);

        if (this.subscribedTopics.has(topic)) {
            return;
        }

        const client = await this.ensureConnectedClient();

        await new Promise<void>((resolve, reject) => {
            client.subscribe(topic, (error: Error | null) => {
                if (error) {
                    reject(error);
                    return;
                }

                this.subscribedTopics.add(topic);
                resolve();
            });
        });
    }

    async markUserOnline(userId: string): Promise<void> {
        presenceService.markOnline(userId);

        const topic = `presence/${userId}`;
        const payload = {
            userId,
            online: true,
            lastSeen: null,
        };

        await this.publish(topic, payload, { qos: 1 });
    }

    async markUserOffline(userId: string): Promise<void> {
        presenceService.markOffline(userId);

        const topic = `presence/${userId}`;
        const payload = {
            userId,
            online: false,
            lastSeen: new Date(),
        };

        await this.publish(topic, payload, { qos: 1 });
    }

    async disconnect(): Promise<void> {
        if (!this.client) {
            return;
        }

        const currentClient = this.client;
        this.client = null;

        await new Promise<void>((resolve, reject) => {
            currentClient.end(false, {}, (error?: Error) => {
                if (error) {
                    reject(error);
                    return;
                }

                resolve();
            });
        });

        this.subscribedTopics.clear();
    }

    private async ensureConnectedClient(): Promise<MqttClient> {
        await this.connect();

        if (!this.client) {
            throw new Error("MQTT client is not initialized");
        }

        return this.client;
    }

    private async waitForConnect(): Promise<void> {
        if (!this.client) {
            throw new Error("MQTT client is not initialized");
        }

        if (this.client.connected) {
            return;
        }

        await new Promise<void>((resolve, reject) => {
            const client = this.client;

            if (!client) {
                reject(new Error("MQTT client is not initialized"));
                return;
            }

            const onConnect = (): void => {
                cleanup();
                resolve();
            };

            const onError = (error: Error): void => {
                cleanup();
                reject(error);
            };

            const cleanup = (): void => {
                client.off("connect", onConnect);
                client.off("error", onError);
            };

            client.on("connect", onConnect);
            client.on("error", onError);
        });
    }

    private assertValidTopic(topic: string): void {
        if (!topic?.trim()) {
            throw new Error("MQTT topic is required");
        }
    }
}

export default MqttService;