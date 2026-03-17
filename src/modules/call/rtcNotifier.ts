/**
 * rtcNotifier — HTTP client that pushes call events from backend-api
 * into the rtc-service signaling server via its internal REST endpoint.
 *
 * This decouples the two services: rtc-service does NOT need a shared Redis
 * instance for the basic setup (though Redis adapter is still recommended
 * for horizontal scaling of rtc-service itself).
 */

const RTC_SERVICE_URL = process.env.RTC_SERVICE_URL ?? 'http://localhost:4000';
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY ?? 'internal-secret';

/**
 * Send an event to a specific user via rtc-service.
 */
export async function notifyUser(
    event: string,
    userId: string,
    payload: Record<string, unknown>,
): Promise<void> {
    try {
        const res = await fetch(`${RTC_SERVICE_URL}/internal/notify-call`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-internal-api-key': INTERNAL_API_KEY,
            },
            body: JSON.stringify({ event, targetUserId: userId, payload }),
        });

        if (!res.ok) {
            const body = await res.text();
            console.error(`[rtcNotifier] HTTP ${res.status} for event "${event}" to user ${userId}: ${body}`);
        }
    } catch (err: unknown) {
        // Non-fatal — signaling failure should not abort the REST response
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[rtcNotifier] Failed to notify user ${userId}:`, message);
    }
}
