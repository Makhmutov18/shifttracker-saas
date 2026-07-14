import ast
import hmac
import unittest
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
AUTH_PATH = REPO_ROOT / "backend" / "app" / "auth.py"
ROUTER_PATH = REPO_ROOT / "backend" / "app" / "routers" / "web_auth.py"
MODEL_PATH = REPO_ROOT / "backend" / "app" / "models.py"


class WebAuthRegressionTests(unittest.TestCase):
    def setUp(self) -> None:
        self.auth_source = AUTH_PATH.read_text(encoding="utf-8")
        self.router_source = ROUTER_PATH.read_text(encoding="utf-8")
        self.model_source = MODEL_PATH.read_text(encoding="utf-8")

    def test_oidc_start_uses_state_pkce_and_nonce(self) -> None:
        self.assertIn("secrets.token_urlsafe(32)", self.router_source)
        self.assertIn("code_challenge_method", self.router_source)
        self.assertIn('"S256"', self.router_source)
        self.assertIn('"nonce": nonce', self.router_source)
        self.assertIn("httponly=True", self.router_source)

    def test_callback_validates_state_and_id_token_claims(self) -> None:
        self.assertIn("read_signed_state", self.router_source)
        self.assertIn("hmac.compare_digest(state", self.router_source)
        self.assertIn('issuer="https://oauth.telegram.org"', self.router_source)
        self.assertIn("audience=settings.TELEGRAM_OIDC_CLIENT_ID", self.router_source)
        self.assertIn('"exp"', self.router_source)
        self.assertIn("expected_nonce", self.router_source)

    def test_token_exchange_uses_basic_auth_and_safe_form_body(self) -> None:
        module = ast.parse(self.router_source)
        exchange = next(
            node for node in module.body if isinstance(node, ast.AsyncFunctionDef) and node.name == "_exchange_code"
        )
        post_call = next(
            node
            for node in ast.walk(exchange)
            if isinstance(node, ast.Call)
            and isinstance(node.func, ast.Attribute)
            and node.func.attr == "post"
        )
        keywords = {keyword.arg: keyword.value for keyword in post_call.keywords}

        basic_auth = keywords["auth"]
        self.assertIsInstance(basic_auth, ast.Call)
        self.assertEqual(ast.unparse(basic_auth.func), "httpx.BasicAuth")
        self.assertEqual(
            [ast.unparse(argument) for argument in basic_auth.args],
            ["settings.TELEGRAM_OIDC_CLIENT_ID", "settings.TELEGRAM_OIDC_CLIENT_SECRET"],
        )

        data = keywords["data"]
        self.assertIsInstance(data, ast.Dict)
        data_keys = {key.value for key in data.keys if isinstance(key, ast.Constant)}
        self.assertEqual(
            data_keys,
            {"grant_type", "client_id", "code", "redirect_uri", "code_verifier"},
        )
        self.assertNotIn("client_secret", data_keys)

    def test_nonce_is_required_and_must_match(self) -> None:
        module = ast.parse(self.router_source)
        nonce_function = next(
            node for node in module.body if isinstance(node, ast.FunctionDef) and node.name == "_validate_nonce"
        )
        namespace = {"hmac": hmac}
        exec(compile(ast.Module(body=[nonce_function], type_ignores=[]), str(ROUTER_PATH), "exec"), namespace)
        validate_nonce = namespace["_validate_nonce"]

        validate_nonce({"nonce": "expected"}, "expected")
        with self.assertRaises(ValueError):
            validate_nonce({}, "expected")
        with self.assertRaises(ValueError):
            validate_nonce({"nonce": "wrong"}, "expected")

    def test_unknown_and_inactive_users_are_rejected_without_creation(self) -> None:
        callback = ast.parse(self.router_source)
        callback_source = next(
            ast.get_source_segment(self.router_source, node) or ""
            for node in callback.body
            if isinstance(node, ast.AsyncFunctionDef) and node.name == "telegram_login_callback"
        )
        self.assertIn("if not user", callback_source)
        self.assertIn("ensure_user_is_active(user)", callback_source)
        self.assertNotIn("session.add(User", callback_source)

    def test_session_stores_hashes_and_csrf_is_required(self) -> None:
        self.assertIn("token_hash=hash_secret(raw_token)", self.router_source)
        self.assertIn("csrf_token_hash=hash_secret(csrf_token)", self.router_source)
        self.assertIn("ensure_web_csrf(request, web_session)", self.auth_source)
        self.assertIn('"X-CSRF-Token"', self.auth_source)

    def test_session_model_has_no_raw_token_or_telegram_payload_fields(self) -> None:
        web_session_model = self.model_source.split("class WebSession", 1)[1]
        self.assertIn("token_hash", web_session_model)
        self.assertIn("csrf_token_hash", web_session_model)
        self.assertNotIn("init_data", web_session_model)
        self.assertNotIn("access_token", web_session_model)

    def test_required_web_auth_routes_exist(self) -> None:
        for route in ("/telegram/start", "/telegram/callback", "/session", "/logout"):
            self.assertIn(f'@router.get("{route}")' if route != "/logout" else f'@router.post("{route}")', self.router_source)


if __name__ == "__main__":
    unittest.main()
