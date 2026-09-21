import express from "express";
import cors from "cors";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import axios from "axios";

const app = express();
app.use(cors());
// ĐÃ XÓA: app.use(express.json()) - Để hệ thống MCP tự do đọc dữ liệu

const transportMap = new Map();

app.get("/sse", async (req, res) => {
  // Cung cấp đường dẫn tuyệt đối cho Gemini để tránh lạc đường
  const messageEndpoint = "/message";
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
    if (request.params.name === "dang_video_len_facebook") {
      const { video_url, noi_dung } = request.params.arguments;
      const pageId = process.env.FB_PAGE_ID;
      const pageToken = process.env.FB_PAGE_ACCESS_TOKEN;

      try {
        const response = await axios.post(
          `https://graph.facebook.com/v19.0/${pageId}/videos`,
          { access_token: pageToken, description: noi_dung, file_url: video_url }
        );
        return { content: [{ type: "text", text: `Đăng thành công! Video ID: ${response.data.id}` }] };
      } catch (error) {
         return { content: [{ type: "text", text: `Lỗi: ${error.response ? JSON.stringify(error.response.data) : error.message}` }], isError: true };
      }
    }
    throw new Error("Công cụ không tồn tại");
  });

  await mcpServer.connect(transport);
  transportMap.set(transport.sessionId, transport);
  
  // Dọn dẹp session khi đóng kết nối
  req.on('close', () => {
    transportMap.delete(transport.sessionId);
  });
});

// Route này chỉ nhận luồng data thô để MCP tự xử lý
app.post("/message", async (req, res) => {
  const sessionId = req.query.sessionId;
  const transport = transportMap.get(sessionId);
  
  if (!transport) {
    return res.status(404).send("Session không tồn tại.");
  }
  
  await transport.handlePostMessage(req, res);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Trạm gác đám mây đã khởi động tại cổng ${PORT}`));
