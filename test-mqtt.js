const mqtt = require('mqtt');
console.log("Connecting to mqtts://xc679161.ala.asia-southeast1.emqxsl.com:8883");
const client = mqtt.connect('mqtts://xc679161.ala.asia-southeast1.emqxsl.com:8883', {
  username: 'admin',
  password: 'NSR7tiDyaLWQq5S',
  rejectUnauthorized: false,
  clientId: 'testing_client_' + Math.random().toString(16).substring(2, 8)
});

client.on('connect', () => {
    console.log("Connected successfully!");
    client.publish('test/topic', 'hello from test script', (err) => {
        if (err) console.error("Publish error:", err);
        else console.log("Published successfully!");
        client.end();
    });
});
client.on('error', (err) => {
    console.error("Connection error:", err);
    client.end();
});
