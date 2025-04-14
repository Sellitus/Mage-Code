# Local Model Requirements

This directory should contain the following model files for local inference:

1. `tinyllama-1b.onnx` - The TinyLlama model converted to ONNX format, optimized for CPU inference
2. `tokenizer.model` - The associated SentencePiece tokenizer model

## Model Details

- **TinyLlama**: A lightweight language model designed for efficient CPU inference
- **Context Window**: 2048 tokens
- **Typical Response Length**: Up to 256 tokens
- **Optimization**: Uses ONNX Runtime with CPU-specific optimizations

## Setup Instructions

1. Download the TinyLlama ONNX model:

    - Convert the PyTorch model to ONNX format using the official TinyLlama repository tools
    - Place the converted model in this directory as `tinyllama-1b.onnx`

2. Download the tokenizer:
    - Get the SentencePiece tokenizer model from the TinyLlama repository
    - Place it in this directory as `tokenizer.model`

## Usage Notes

- The model is automatically loaded when the extension starts
- If model files are missing, the system will fallback to cloud-only mode
- Ensure both files are present before enabling local inference
