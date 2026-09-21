import express from "express";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import axios from "axios";
import "dotenv/config";

const app = express();

// Cấu hình CORS cho phép mọi nguồn kết nối
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, Accept, Authorization, MCP-Protocol-Version");
  if (req.method === "OPTIONS") return res.status(200).end();
  next();
});

// LƯU Ý: Đã xóa app.use(express.json()) ở đây để tránh làm hỏng luồng dữ liệu SSE của MCP

const transportMap = new Map();

app.get("/", (_req, res) => {
  res.status(200).json({ status: "ok", service: "fb-cloud-publisher" });
});

// Đường dẫn SSE đúng chuẩn cho Gemini Spark / AI Clients
app.get("/mcp", async (req, res) => {
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
    if (request.params.name === "dang_video_len_facebook") {
      const { video_url, noi_dung } = request.params.arguments;
      const pageId = process.env.FB_PAGE_ID;
      const pageToken = process.env.FB_PAGE_ACCESS_TOKEN;

      if (!pageId || !pageToken) {
        return {
          content: [{ type: "text", text: "Server chưa cấu hình FB_PAGE_ID hoặc FB_PAGE_ACCESS_TOKEN." }],
          isError: true,
        };
      }

      try {
        new URL(video_url);
      } catch {
        return {
          content: [{ type: "text", text: "video_url phải là URL công khai hợp lệ." }],
          isError: true,
        };
      }

      try {
        const params = new URLSearchParams({
          access_token: pageToken,
          description: noi_dung,
          file_url: video_url,
        });
        const response = await axios.post(
          `https://graph.facebook.com/v19.0/${pageId}/videos`,
          params,
          { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
        );
        return { content: [{ type: "text", text: `Đăng thành công! Video ID: ${response.data.id}` }] };
      } catch (error) {
         return { content: [{ type: "text", text: `Lỗi đăng bài: ${error.response?.data ? JSON.stringify(error.response.data) : error.message}` }], isError: true };
      }
    }
    throw new Error("Công cụ không tồn tại");
  });

  await mcpServer.connect(transport);
  transportMap.set(transport.sessionId, transport);

  req.on('close', () => {
    transportMap.delete(transport.sessionId);
  });
});

// Xử lý thông điệp gửi từ AI qua query sessionId
app.post("/message", async (req, res) => {
  const sessionId = req.query.sessionId;
  const transport = transportMap.get(sessionId);
  if (transport) {
    await transport.handlePostMessage(req, res);
  } else {
    res.status(404).send("Session không tồn tại.");
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Trạm gác đám mây đang chạy tại cổng ${PORT}`));
