import { ToolModule } from './interface.js';

export const NotifyTool: ToolModule = {
  name: "Group Bot Notification",
  configKeys: ["feishuWebhook", "dingtalkWebhook", "wecomWebhook"],
  definition: {
    type: "function",
    function: {
      name: "send_notification",
      description: "Send a text message to an Instant Messaging (IM) Group Bot (Feishu/Lark, DingTalk, WeCom).",
      parameters: {
        type: "object",
        properties: {
          platform: {
            type: "string",
            enum: ["feishu", "dingtalk", "wecom"],
            description: "The target platform."
          },
          content: {
            type: "string",
            description: "The text content to send."
          }
        },
        required: ["platform", "content"]
      }
    }
  },
  handler: async (args: any, config: any) => {
    const { platform, content } = args;
    let webhookUrl = '';
    let payload = {};

    // 1. Determine Webhook URL and Payload Format
    switch (platform) {
      case 'feishu':
        webhookUrl = config.feishuWebhook || process.env.FEISHU_WEBHOOK;
        if (!webhookUrl) return "Error: Feishu Webhook URL is not configured.";
        payload = {
          msg_type: "text",
          content: { text: content }
        };
        break;

      case 'dingtalk':
        webhookUrl = config.dingtalkWebhook || process.env.DINGTALK_WEBHOOK;
        if (!webhookUrl) return "Error: DingTalk Webhook URL is not configured.";
        payload = {
          msgtype: "text",
          text: { content: content }
        };
        break;

      case 'wecom':
        webhookUrl = config.wecomWebhook || process.env.WECOM_WEBHOOK;
        if (!webhookUrl) return "Error: WeCom Webhook URL is not configured.";
        payload = {
          msgtype: "text",
          text: { content: content }
        };
        break;

      default:
        return `Error: Unknown platform '${platform}'. Supported: feishu, dingtalk, wecom.`;
    }

    // 2. Send Request
    try {
      const response = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      const result: any = await response.json();

      // Platform specific success checks
      // Feishu: code 0
      // DingTalk: errcode 0
      // WeCom: errcode 0
      if (result.code === 0 || result.errcode === 0) {
        return `Notification sent to ${platform} successfully.`;
      } else {
        return `Failed to send to ${platform}. API Response: ${JSON.stringify(result)}`;
      }

    } catch (error: any) {
      return `Network error sending notification: ${error.message}`;
    }
  }
};
