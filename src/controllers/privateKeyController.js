// src/controllers/privateKeyController.js
import { requestPrivateKey } from "../services/privateKeyService.js";

export async function handlePrivateKeyRequest(req, res) {
  try {
    const { email } = req.body;
    const data = await requestPrivateKey(email);
    res.status(200).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
