import OpenAI from 'openai';
import * as fs from 'fs';
import * as path from 'path';
import { ToolModule } from './interface.js';

const toolDefinition = {
  type: "function",
  function: {
    name: "generate_image",
    description: "Generates or edits images using AI models (DALL-E 3/2). Supports text-to-image, image variation, and image editing. Allows control over size, resolution (quality), and model selection.",
    parameters: {
      type: "object",
      properties: {
        prompt: {
          type: "string",
          description: "Text description of the desired image. Required for text-to-image and edit modes."
        },
        image_path: {
          type: "string",
          description: "Path to an existing image file (local path). Required for variation and editing modes."
        },
        mask_path: {
          type: "string",
          description: "Path to a mask image file (local path). Optional, used only for editing."
        },
        mode: {
          type: "string",
          enum: ["text-to-image", "variation", "edit"],
          description: "Operation mode. Inferred if not provided."
        },
        model: {
          type: "string",
          enum: ["dall-e-3", "dall-e-2"],
          description: "The AI model to use. 'dall-e-3' for high quality (default), 'dall-e-2' for faster/smaller generation or editing.",
          default: "dall-e-3"
        },
        n: {
          type: "integer",
          description: "Number of images to generate. Default is 1.",
          default: 1
        },
        size: {
          type: "string",
          description: "Image resolution/size. DALL-E 3: '1024x1024', '1024x1792' (Portrait), '1792x1024' (Landscape). DALL-E 2: '256x256', '512x512', '1024x1024'.",
          default: "1024x1024"
        },
        quality: {
          type: "string",
          enum: ["standard", "hd"],
          description: "Image quality (DALL-E 3 only). 'hd' creates more detailed images. Default is 'standard'.",
          default: "standard"
        },
        style: {
          type: "string",
          enum: ["vivid", "natural"],
          description: "Image style (DALL-E 3 only). Default is 'vivid'.",
          default: "vivid"
        },
        output_dir: {
          type: "string",
          description: "Directory to save the generated images. Defaults to current directory."
        }
      },
      required: []
    }
  }
};

async function downloadImage(url: string, destPath: string): Promise<void> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to download image: ${response.statusText}`);
  const buffer = await response.arrayBuffer();
  fs.writeFileSync(destPath, Buffer.from(buffer));
}

const handler = async (args: any, config: any): Promise<string> => {
  const apiKey = config.imageApiKey || config.apiKey || process.env.OPENAI_API_KEY;
  const baseURL = config.imageBaseUrl || config.baseUrl || process.env.OPENAI_BASE_URL;

  if (!apiKey) {
    return "Error: Image Service API Key is missing. Please configure it in .autoclaw/setting.json (imageApiKey or apiKey).";
  }

  const client = new OpenAI({ 
    apiKey: apiKey,
    baseURL: baseURL
  });

  const {
    prompt,
    image_path,
    mask_path,
    n = 1,
    size = "1024x1024",
    quality = "standard",
    style = "vivid",
    output_dir = "."
  } = args;

  let mode = args.mode;
  let model = args.model || config.imageModel || "dall-e-3";

  // Infer mode if not provided
  if (!mode) {
    if (image_path && mask_path) mode = "edit";
    else if (image_path) mode = "variation";
    else mode = "text-to-image";
  }

  // Model-specific validations
  if (mode === "text-to-image") {
    // DALL-E 3 Validation
    if (model === "dall-e-3") {
      const validSizes = ["1024x1024", "1024x1792", "1792x1024"];
      if (!validSizes.includes(size)) {
         return `Error: Invalid size '${size}' for DALL-E 3. Supported sizes are: ${validSizes.join(", ")}.`;
      }
    }
    // DALL-E 2 Validation
    else if (model === "dall-e-2") {
      const validSizes = ["256x256", "512x512", "1024x1024"];
      if (!validSizes.includes(size)) {
        return `Error: Invalid size '${size}' for DALL-E 2. Supported sizes are: ${validSizes.join(", ")}.`;
      }
    }
  } else {
    // Variation and Edit only support DALL-E 2 currently
    if (model === "dall-e-3") {
      console.log("Note: DALL-E 3 does not support variation/edit. Falling back to DALL-E 2.");
      model = "dall-e-2";
    }
  }

  // Resolve output directory
  const resolvedOutputDir = path.resolve(process.cwd(), output_dir);
  if (!fs.existsSync(resolvedOutputDir)) {
    fs.mkdirSync(resolvedOutputDir, { recursive: true });
  }

  const generatedFiles: string[] = [];

  try {
    if (mode === "text-to-image") {
      if (!prompt) return "Error: 'prompt' is required for text-to-image mode.";
      
      console.log(`Generating ${n} image(s) with ${model} (${size}, ${quality})...`);
      
      if (model === "dall-e-3") {
        for (let i = 0; i < n; i++) {
          const response = await client.images.generate({
            model: "dall-e-3",
            prompt: prompt,
            n: 1, // DALL-E 3 constraint
            size: size as any,
            quality: quality as any,
            style: style as any,
            response_format: "url"
          });
  
          const imageUrl = response.data?.[0]?.url;
          if (imageUrl) {
            const fileName = `generated-${Date.now()}-${i + 1}.png`;
            const filePath = path.join(resolvedOutputDir, fileName);
            await downloadImage(imageUrl, filePath);
            generatedFiles.push(filePath);
          }
        }
      } else {
        // DALL-E 2
        const response = await client.images.generate({
          model: "dall-e-2",
          prompt: prompt,
          n: n,
          size: size as any,
          response_format: "url"
        });

        const data = response.data || [];
        for (let i = 0; i < data.length; i++) {
          const imageUrl = data[i].url;
          if (imageUrl) {
            const fileName = `generated-${Date.now()}-${i + 1}.png`;
            const filePath = path.join(resolvedOutputDir, fileName);
            await downloadImage(imageUrl, filePath);
            generatedFiles.push(filePath);
          }
        }
      }

    } else if (mode === "variation") {
      if (!image_path) return "Error: 'image_path' is required for variation mode.";
      if (!fs.existsSync(image_path)) return `Error: Image file not found at ${image_path}`;

      console.log(`Generating ${n} variation(s) with ${model}...`);

      const response = await client.images.createVariation({
        image: fs.createReadStream(image_path),
        n: n,
        model: "dall-e-2", // Explicitly set model just in case, though it's the default/only option
        size: size as any, 
        response_format: "url"
      });

      const data = response.data || [];
      for (let i = 0; i < data.length; i++) {
        const imageUrl = data[i].url;
        if (imageUrl) {
          const fileName = `variation-${Date.now()}-${i + 1}.png`;
          const filePath = path.join(resolvedOutputDir, fileName);
          await downloadImage(imageUrl, filePath);
          generatedFiles.push(filePath);
        }
      }

    } else if (mode === "edit") {
      if (!image_path) return "Error: 'image_path' is required for edit mode.";
      if (!prompt) return "Error: 'prompt' is required for edit mode.";
      if (!fs.existsSync(image_path)) return `Error: Image file not found at ${image_path}`;
      
      console.log(`Editing image with ${model}...`);

      const params: any = {
        image: fs.createReadStream(image_path),
        prompt: prompt,
        n: n,
        model: "dall-e-2",
        size: size as any,
        response_format: "url"
      };

      if (mask_path && fs.existsSync(mask_path)) {
        params.mask = fs.createReadStream(mask_path);
      }

      const response = await client.images.edit(params);

      const data = response.data || [];
      for (let i = 0; i < data.length; i++) {
        const imageUrl = data[i].url;
        if (imageUrl) {
          const fileName = `edited-${Date.now()}-${i + 1}.png`;
          const filePath = path.join(resolvedOutputDir, fileName);
          await downloadImage(imageUrl, filePath);
          generatedFiles.push(filePath);
        }
      }
    } else {
      return `Error: Unknown mode '${mode}'.`;
    }

    return `Successfully generated ${generatedFiles.length} image(s):\n${generatedFiles.join('\n')}`;

  } catch (error: any) {
    return `Error generating image: ${error.message}`;
  }
};

export const ImageTool: ToolModule = {
  name: "Image Generation",
  definition: toolDefinition as any,
  handler: handler
};
