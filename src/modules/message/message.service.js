class MessageService {
  constructor() {
    this.messages = [];
    this.nextId = 1;
  }

  createMessage({ from, to, text }) {
    const message = {
      id: this.nextId++,
      from,
      to,
      text,
      createdAt: new Date().toISOString(),
    };

    this.messages.push(message);
    return message;
  }

  listMessages({ from, to } = {}) {
    if (!from && !to) {
      return this.messages;
    }

    return this.messages.filter((msg) => {
      if (from && msg.from !== from) return false;
      if (to && msg.to !== to) return false;
      return true;
    });
  }
}

const messageService = new MessageService();

module.exports = {
  MessageService,
  messageService,
};

