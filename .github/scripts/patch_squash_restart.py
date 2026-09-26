#!/usr/bin/env python3
from pathlib import Path
path = Path("public/app.js")
text = path.read_text()
if "void pet.offsetWidth" in text and 'motion.style.animation = "none"' in text:
    print("already patched")
    raise SystemExit(0)
old = (
    "    clearTimeout(pressTimer);\n"
    "    pet.classList.add(\"is-press\");\n"
    "    showFrame(\"react\");\n"
    "    pressTimer = window.setTimeout(() => {\n"
    "      pet.classList.remove(\"is-press\");\n"
    "      showFrame(restingFrame());\n"
    "    }, 700);"
)
new = (
    "    clearTimeout(pressTimer);\n"
    "    // Restart squash even mid-animation (class reflow + iOS animation reset).\n"
    "    pet.classList.remove(\"is-press\");\n"
    "    void pet.offsetWidth;\n"
    "    const motion = pet.querySelector(\".pet-motion\");\n"
    "    if (motion) {\n"
    "      motion.style.animation = \"none\";\n"
    "      void motion.offsetWidth;\n"
    "      motion.style.animation = \"\";\n"
    "    }\n"
    "    pet.classList.add(\"is-press\");\n"
    "    showFrame(\"react\");\n"
    "    pressTimer = window.setTimeout(() => {\n"
    "      pet.classList.remove(\"is-press\");\n"
    "      showFrame(restingFrame());\n"
    "    }, 700);"
)
if old not in text:
    raise SystemExit("OLD react block not found")
path.write_text(text.replace(old, new, 1))
print("patched ok")
