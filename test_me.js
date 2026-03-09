const jwt = require("jsonwebtoken");
const token = jwt.sign({ userId: "test-id", email: "test@example.com" }, "JWT_TOKEN_KEY", { expiresIn: "7d" });

fetch("http://localhost:3000/auth/me", {
  headers: {
    Cookie: `accessToken=${token}`
  }
}).then(res => res.json().then(data => console.log(res.status, data))).catch(err => console.log(err));
