import { summarizeV2Service } from './summarize-v2.service';

async function runTests() {
  const scenarios = [
    {
      name: 'Vietnamese conversation',
      input: `
[2024-05-10 10:00] Hieu: Chào mọi người, hôm nay chúng ta có họp không?
[2024-05-10 10:01] Anh: Có chứ, 2h chiều nay nhé.
[2024-05-10 10:02] Binh: Ok, họp về vấn đề gì vậy?
[2024-05-10 10:03] Anh: Về việc refactor API summarize v2 đang bị lỗi trả về transcript.
[2024-05-10 10:04] Hieu: Nhất trí, tôi sẽ chuẩn bị tài liệu.
`
    },
    {
      name: 'Multilingual chat',
      input: `
[2024-05-10 11:00] John: Hello team, how is the summary fix going?
[2024-05-10 11:01] Minh: Cư dân mạng đang kêu ca về việc nó trả về transcript quá nhiều.
[2024-05-10 11:02] John: I see. We need a semantic summary instead of just listing messages.
[2024-05-10 11:03] Tanaka: 了解しました。私はプロンプトの改善を担当します。
[2024-05-10 11:04] Minh: Ok, let's fix it by today.
`
    },
    {
      name: 'Noisy messages',
      input: `
[2024-05-10 12:00] User1: (y)
[2024-05-10 12:01] User2: Hello?
[2024-05-10 12:01] User1: Hi
[2024-05-10 12:02] User2: Có ai đó không?
[2024-05-10 12:03] User3: [Sticker]
[2024-05-10 12:04] User1: Đang bận tí
[2024-05-10 12:05] User2: Ok khi nào rảnh báo nhé
`
    },
    {
      name: 'Mixed Text + Media (Filtered)',
      input: `
[2024-05-10 15:00] User1: Đây là báo cáo tháng này.
[2024-05-10 15:01] User1: [Image]
[2024-05-10 15:02] User2: Mình nhận được rồi, để mình xem.
[2024-05-10 15:03] User2: [Sticker]
[2024-05-10 15:04] User1: Có gì báo mình nhé.
`
    },
    {
      name: 'Sticker Spam (Should Fallback)',
      input: `
[2024-05-10 16:00] User1: [Sticker]
[2024-05-10 16:01] User2: [Sticker]
[2024-05-10 16:02] User1: [Image]
`
    },
    {
      name: 'Noisy Support Chat with stuttering',
      input: `
[2024-05-10 17:00] Khách: Alo alo, mình mình đang gặp lỗi lỗi.
[2024-05-10 17:01] Support: Chào bạn, bạn bạn gặp lỗi gì gì?
[2024-05-10 17:02] Khách: App app cứ bị bị văng văng ra ngoài ngoài.
[2024-05-10 17:03] Support: Bạn thử thử xóa xóa cache cache nhé nhé.
`
    },
    {
      name: 'Multilingual and Technical',
      input: `
[2024-05-10 18:00] Dev1: I just pushed the fix for the memory leak.
[2024-05-10 18:01] Dev2: Great, let's deploy to staging first.
[2024-05-10 18:02] Lead: Đã kiểm tra code, ổn đấy. Merge đi.
[2024-05-10 18:03] Dev1: Done.
`
    }
  ];

  console.log('--- STARTING REGRESSION TESTS ---');
  for (const scenario of scenarios) {
    console.log(`\nScenario: ${scenario.name}`);
    console.log('Input lines:', scenario.input.trim().split('\n').length);
    
    // Note: This actually calls the API. Ensure HF_TOKEN is in .env
    const result = await summarizeV2Service.summarize({ messages: scenario.input });
    
    if (result.success) {
      console.log('SUCCESS');
      console.log('Summary:', result.summary);
      console.log('Resolved:', result.resolved);
      console.log('Pending:', result.pending);
    } else {
      console.log('FAILED:', result.message);
    }
  }
  console.log('\n--- TESTS FINISHED ---');
}

// Check if running directly
if (require.main === module) {
  runTests().catch(console.error);
}

export { runTests };
