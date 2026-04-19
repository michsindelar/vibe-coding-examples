# LLM API Tool Encryption

Small OpenAI API example showing tool calling with asymmetric encryption and decryption. The model can invoke local tools that encrypt plaintext with an RSA public key and decrypt ciphertext with the matching private key.

# Run

## Generate RSA keys

Create a local `keys` directory and generate the PEM files before running the script.

```bash
mkdir -p keys
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out keys/private_key.pem
openssl pkey -in keys/private_key.pem -pubout -out keys/public_key.pem
```

These files are ignored by Git through `.gitignore`.

## Set environment variables

Set `OPENAI_API_KEY` before running the program.

```bash
export OPENAI_API_KEY="your_api_key_here"
```

## Run directly

`uv run main-start.py`

## Run indirectly

Create a virtual environment

```bash
uv venv
```

Activate the virtual environment

```bash
source .venv/bin/activate
```

Install packages

```bash
uv sync
```

Run the script

```bash
python main-start.py
```
