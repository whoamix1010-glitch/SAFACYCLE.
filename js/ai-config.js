// Address of the Waste Expert backend that the website's chatbot talks to.
//
//   ""  (empty)  -> use a backend on this same computer (http://127.0.0.1:5000),
//                   started with:  python -m ai_backend.app
//
//   "https://xxxx.ngrok-free.dev"  (whatever ngrok shows next to "Forwarding")
//                -> everyone uses the backend started with start-public-backend.bat.
//                   Paste the address (no trailing slash), save, and upload this file to GitHub.
//
var SAFACYCLE_BACKEND_ADDRESS = "https://steam-gaffe-voicing.ngrok-free.dev";   // <- put the address between the quotes

window.SAFACYCLE_AI_API_BASE_URL = window.SAFACYCLE_AI_API_BASE_URL || SAFACYCLE_BACKEND_ADDRESS;
