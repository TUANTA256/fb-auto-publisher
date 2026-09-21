import express from "express";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import axios from "axios";

const app = express();

// 1. CẤU HÌNH CỬA BẢO MẬT THỦ CÔNG (Chống chặn 100%)
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS, PUT, PATCH, DELETE");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }
  next();
});

// 2. PARSER JSON (Bắt buộc để dịch ngôn ngữ của Gemini)
app.use(express.json());

// 3. TRANG CHÀO MỪNG (Để bạn test không bị lỗi Cannot GET /)
app.get("/", (req, res) => {
  res.send("Trạm gác MCP Server đang hoạt động tốt! Sẵn sàng nhận lệnh từ Gemini.");
});

const transportMap = new Map();

// 4. CỔNG KẾT NỐI CHÍNH
app.get("/sse", async (req, res) => {
  console.log("🚀 [SSE] CÓ YÊU CẦU KẾT NỐI MỚI TỪ GEMINI...");
  
  const transport = new SSEServerTransport("/message", res);
  const mcpServer = new Server({ name: "fb-cloud-publisher", version: "1.0.0" }, { capabilities: { tools: {} } });

  mcpServer.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [{
      name: "dang_video_len_facebook",
      description: "Đăng video lên Facebook Fanpage thông qua đường dẫn URL công khai",
      inputSchema: {
        type: "object",
        properties: {
          video_url: { type: "string", description: "Đường dẫn tải video (URL public)" },
          noi_dung: { type: "string", description: "Nội dung caption bài viết kèm hashtag" }
        },
        required: ["video_url", "noi_dung"],
      }
    }]
  }));

  mcpServer.setRequestHandler(CallToolRequestSchema, async (request) => {
    console.log(`🛠️ [TOOL] Gemini đang ra lệnh thực thi: ${request.params.name}`);
    if (request.params.name === "dang_video_len_facebook") {
      const { video_url, noi_dung } = request.params.arguments;
      const pageId = process.env.FB_PAGE_ID;
      const pageToken = process.env.FB_PAGE_ACCESS_TOKEN;

      try {
        const response = await axios.post(
          `https://graph.facebook.com/v19.0/${pageId}/videos`,
          { access_token: pageToken, description: noi_dung, file_url: video_url }
        );
        console.log(`✅ [TOOL] Đăng thành công! Video ID: ${response.data.id}`);
        return { content: [{ type: "text", text: `Đăng thành công! Video ID: ${response.data.id}` }] };
      } catch (error) {
         console.error(`❌ [TOOL] LỖI TỪ FACEBOOK:`, error.response?.data || error.message);
         return { content: [{ type: "text", text: `Lỗi đăng bài: ${error.response ? JSON.stringify(error.response.data) : error.message}` }], isError: true };
      }
    }
    throw new Error("Công cụ không tồn tại");
  });

  await mcpServer.connect(transport);
  transportMap.set(transport.sessionId, transport);
  console.log(`✅ [SSE] Đã cấp Session ID: ${transport.sessionId}`);
  
  req.on('close', () => {
    console.log(`🔌 [SSE] Gemini ngắt kết nối Session: ${transport.sessionId}`);
    transportMap.delete(transport.sessionId);
  });
});

// 5. CỔNG NHẬN LỆNH THỰC THI
app.post("/message", async (req, res) => {
  const sessionId = req.query.sessionId;
  console.log(`📩 [POST] Đang nhận lệnh POST cho Session: ${sessionId}`);
  
  const transport = transportMap.get(sessionId);
  if (!transport) {
    console.log("❌ [POST] LỖI: Không tìm thấy Session!");
    return res.status(404).send("Session không tồn tại.");
  }
  
  try {
    await transport.handlePostMessage(req, res);
  } catch (error) {
    console.error("❌ [POST] Lỗi khi xử lý dữ liệu từ Gemini:", error);
    res.status(500).send("Lỗi xử lý.");
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Trạm gác đám mây đã khởi động tại cổng ${PORT}`));
