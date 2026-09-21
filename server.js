import express from "express";
import cors from "cors";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import axios from "axios";

const app = express();

// Bật CORS cho tất cả các nguồn (để Gemini không bị chặn)
app.use(cors({ origin: true, credentials: true }));

const transportMap = new Map();

app.get("/sse", async (req, res) => {
  console.log("🚀 CÓ YÊU CẦU KẾT NỐI MỚI TỪ GEMINI...");
  
  // FIX LỖI: Chỉ định đường dẫn TUYỆT ĐỐI để Gemini không bị lạc
  const messageEndpoint = "https://fb-auto-publisher-8esy.onrender.com/message";
  
  const transport = new SSEServerTransport(messageEndpoint, res);
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
    console.log("🛠️ GEMINI ĐANG GỌI CÔNG CỤ ĐĂNG BÀI!");
    if (request.params.name === "dang_video_len_facebook") {
      const { video_url, noi_dung } = request.params.arguments;
      const pageId = process.env.FB_PAGE_ID;
      const pageToken = process.env.FB_PAGE_ACCESS_TOKEN;

      try {
        const response = await axios.post(
          `https://graph.facebook.com/v19.0/${pageId}/videos`,
          { access_token: pageToken, description: noi_dung, file_url: video_url }
        );
        console.log("✅ Đăng thành công!");
        return { content: [{ type: "text", text: `Đăng thành công! Video ID: ${response.data.id}` }] };
      } catch (error) {
         console.error("❌ LỖI META API:", error.response?.data || error.message);
         return { content: [{ type: "text", text: `Lỗi: ${error.response ? JSON.stringify(error.response.data) : error.message}` }], isError: true };
      }
    }
    throw new Error("Công cụ không tồn tại");
  });

  await mcpServer.connect(transport);
  transportMap.set(transport.sessionId, transport);
  console.log(`✅ Đã cấp Session ID thành công: ${transport.sessionId}`);
  
  req.on('close', () => {
    console.log(`🔌 Gemini đã ngắt kết nối Session ID: ${transport.sessionId}`);
    transportMap.delete(transport.sessionId);
  });
});

app.post("/message", async (req, res) => {
  const sessionId = req.query.sessionId;
  console.log(`📩 Nhận lệnh từ Gemini cho Session: ${sessionId}`);
  
  const transport = transportMap.get(sessionId);
  if (!transport) {
    console.log("❌ LỖI: Session không tồn tại!");
    return res.status(404).send("Session không tồn tại.");
  }
  
  await transport.handlePostMessage(req, res);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Trạm gác đám mây đã khởi động tại cổng ${PORT}`));
