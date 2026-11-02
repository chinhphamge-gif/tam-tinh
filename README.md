# Tâm Tĩnh – Chùa online

Chùa Bái Đính, Chùa Tam Chúc, Đền Ông Hoàng Bảy, Đền Ông Hoàng Mười.
Niệm Phật, tụng kinh, cúng dường, chat thời gian thực.

Chạy cục bộ: `npm install && npm start` rồi mở http://localhost:3000
Biến môi trường tùy chọn: `PORT`, `DATA_DIR` (thư mục lưu stats.json).

## Cấu trúc
- `server.js` – máy chủ HTTP + WebSocket, chia 4 phòng (Bái Đính, Tam Chúc, Đền Hoàng Bảy, Đền Hoàng Mười)
- `public/index.html` – giao diện 3D (Three.js), màn hình bản đồ chọn nơi, đặt pháp danh, chọn nhân vật
- `public/chars/` – nhân vật Chú Tiểu, Sư Thầy, Ông Hoàng Bảy, Ông Hoàng Mười (3 góc nhìn mỗi người)
- `public/map.webp` – bản đồ chọn chùa/đền
