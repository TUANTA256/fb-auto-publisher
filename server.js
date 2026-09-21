import express from "express";
import cors from "cors";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import axios from "axios";

const app = express();
app.use(cors());

// Khai báo biến toàn cục
let transport;
let mcpServer;

app.get("/sse", async (req, res) => {
  // 1. QUAN TRỌNG: Nếu có kết nối cũ bị kẹt, đóng nó lại trước
  if (mcpServer) {
    try { await mcpServer.close(); } catch (e) {}
  }

  // 2. Khởi tạo một phiên làm việc mới tinh cho Gemini
  mcpServer = new Server({ name: "fb-cloud-publisher", version: "1.0.0" }, { capabilities: { tools: {} } });

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

  // 3. Kết nối với Gemini
  transport = new SSEServerTransport("/message", res);
  await mcpServer.connect(transport);
});

app.post("/message", express.json(), async (req, res) => {
  if (transport) {
    await transport.handlePostMessage(req, res);
  } else {
    res.status(400).send("Chưa có kết nối nào.");
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Trạm gác đám mây đã khởi động tại cổng ${PORT}`));
