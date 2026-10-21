import { createServer } from "node:http";
createServer(async (req, res) => {
  if (req.method === "GET") { res.end("ok"); return; }
  let raw = "";
  for await (const chunk of req) raw += chunk;
  const input = JSON.parse(raw);
  const message = JSON.parse(input.messages.at(-1).content).request;
  const output = message.includes("伪造") ? { product: "invented", price: 1 }
    : message.includes("8层") ? { category: "tissue", budgetFen: 5000, minLayers: 8 }
    : message.includes("改成") ? { budgetFen: 3000, minLayers: 4 }
    : { category: "tissue", budgetFen: 5000, minLayers: 3 };
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(output) } }] }));
}).listen(3011, "127.0.0.1");
