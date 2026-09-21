import express from "express";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import axios from "axios";

const app = express();
const server = new Server({ name: "fb-cloud-publisher", version: "1.0.0" }, { capabilities: { tools: {} } });
let transport;

// Dạy AI biết dùng công cụ từ xa
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [{
    name: "dang_video_len_facebook",
    description: "Đăng video lên Facebook Fanpage thông qua đường dẫn URL công khai",
    inputSchema: {
      type: "object",
      properties: {
        video_url: { type: "string", description: "Đường dẫn tải video (URL Google Drive hoặc link public)" },
        noi_dung: { type: "string", description: "Nội dung caption bài viết kèm hashtag" }
      },
      required: ["video_url", "noi_dung"],
    }
  }]
}));

// Nhận lệnh và truyền URL sang Facebook
server.setRequestHandler(CallToolRequestSchema, async (request) => {
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

// Mở "cửa sổ" mạng để Gemini Spark kết nối vào
app.get("/sse", async (req, res) => {
  transport = new SSEServerTransport("/message", res);
  await server.connect(transport);
});

app.post("/message", express.json(), async (req, res) => {
  if (transport) await transport.handlePostMessage(req, res);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Trạm gác đám mây đã khởi động tại cổng ${PORT}`));
