
import axios from 'axios';

async function test() {
  try {
    const response = await axios.post('http://localhost:3000/api/v2/summarize', {
      conversationId: "142415ee-c0ad-4d82-a8ab-0ebdc7a83a9b",
      endTime: "2026-05-10T09:20:34.347Z",
      startTime: "2026-05-03T09:20:34.347Z"
    }, {
      headers: {
        'Authorization': 'Bearer VALID_TOKEN_HERE' // I need a token
      }
    });
    console.log('Response:', response.data);
  } catch (error: any) {
    console.error('Error:', error.response?.status, error.response?.data);
  }
}

// test();
