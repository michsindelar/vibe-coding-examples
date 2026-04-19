import base64
import json
import os
from pprint import pprint
from pathlib import Path

from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding
from dotenv import load_dotenv
from openai import OpenAI

load_dotenv()

BASE_DIR = Path(__file__).resolve().parent
KEYS_DIR = BASE_DIR / "keys"
PRIVATE_KEY_PATH = KEYS_DIR / "private_key.pem"
PUBLIC_KEY_PATH = KEYS_DIR / "public_key.pem"


client = OpenAI(api_key=os.environ.get("OPENAI_API_KEY"))


def read_key_file(path: Path) -> bytes:
    if not path.exists():
        raise FileNotFoundError(
            f"Missing key file: {path}. Generate the RSA keys described in README.md."
        )
    return path.read_bytes()


public_key = serialization.load_pem_public_key(read_key_file(PUBLIC_KEY_PATH))
private_key = serialization.load_pem_private_key(
    read_key_file(PRIVATE_KEY_PATH),
    password=None,
)


def get_encrypted_content(content: str):
    encrypted_bytes = public_key.encrypt(
        content.encode("utf-8"),
        padding.OAEP(
            mgf=padding.MGF1(algorithm=hashes.SHA256()),
            algorithm=hashes.SHA256(),
            label=None,
        ),
    )
    return {
        "algorithm": "RSA-OAEP-SHA256",
        "encrypted_content": base64.b64encode(encrypted_bytes).decode("utf-8"),
    }


def get_decrypted_content(encrypted_content: str):
    encrypted_bytes = base64.b64decode(encrypted_content.encode("utf-8"))
    decrypted_bytes = private_key.decrypt(
        encrypted_bytes,
        padding.OAEP(
            mgf=padding.MGF1(algorithm=hashes.SHA256()),
            algorithm=hashes.SHA256(),
            label=None,
        ),
    )
    return {"decrypted_content": decrypted_bytes.decode("utf-8")}


tools = [
    {
        "type": "function",
        "function": {
            "name": "get_encrypted_content",
            "description": "Encrypt plaintext using the built-in asymmetric public key.",
            "parameters": {
                "type": "object",
                "properties": {
                    "content": {
                        "type": "string",
                        "description": "The plaintext content to encrypt.",
                    }
                },
                "required": ["content"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_decrypted_content",
            "description": "Decrypt a base64-encoded ciphertext using the built-in asymmetric private key.",
            "parameters": {
                "type": "object",
                "properties": {
                    "encrypted_content": {
                        "type": "string",
                        "description": "The base64-encoded ciphertext to decrypt.",
                    }
                },
                "required": ["encrypted_content"],
            },
        },
    },
]

available_functions = {
    "get_encrypted_content": get_encrypted_content,
    "get_decrypted_content": get_decrypted_content,
}


def get_completion_from_messages(messages, model="gpt-4.1-mini"):
    while True:
        response = client.chat.completions.create(
            model=model,
            messages=messages,
            tools=tools,
            tool_choice="auto",
        )

        response_message = response.choices[0].message
        print("Model response:", response_message)

        if not response_message.tool_calls:
            return response_message

        messages.append(
            {
                "role": "assistant",
                "content": response_message.content,
                "tool_calls": [
                    {
                        "id": tool_call.id,
                        "type": tool_call.type,
                        "function": {
                            "name": tool_call.function.name,
                            "arguments": tool_call.function.arguments,
                        },
                    }
                    for tool_call in response_message.tool_calls
                ],
            }
        )

        for tool_call in response_message.tool_calls:
            function_name = tool_call.function.name
            function_args = json.loads(tool_call.function.arguments)
            function_to_call = available_functions[function_name]
            function_response = function_to_call(**function_args)

            print("Tool result:", function_response)

            messages.append(
                {
                    "role": "tool",
                    "tool_call_id": tool_call.id,
                    "name": function_name,
                    "content": json.dumps(function_response),
                }
            )


def main():
    user_question = input("Enter your question: ").strip()
    if not user_question:
        raise ValueError("A question is required.")

    messages = [
        {
            "role": "system",
            "content": (
                "You are a helpful AI assistant. Use tools when the user asks to "
                "encrypt or decrypt content."
            ),
        },
        {
            "role": "user",
            "content": user_question,
        },
    ]

    response = get_completion_from_messages(messages)
    print("--- Full response: ---")
    pprint(response)
    print("--- Response text: ---")
    print(response.content)


if __name__ == "__main__":
    main()
