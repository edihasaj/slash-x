#!/usr/bin/env node
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const pkg = require("../package.json");

const version = stripV(process.env.SLASH_X_RELEASE_TAG) || process.env.SLASH_X_VERSION || pkg.version;
const tag = process.env.SLASH_X_RELEASE_TAG || `v${version}`;
const sha256 = process.env.SLASH_X_TARBALL_SHA256 || "REPLACE_WITH_RELEASE_SHA256";
const repo = process.env.SLASH_X_GITHUB_REPO || "edihasaj/slash-x";
const homepage = process.env.SLASH_X_HOMEPAGE || pkg.homepage || `https://github.com/${repo}`;
const desc = process.env.SLASH_X_DESC || pkg.description || "Local X/Twitter CLI";

console.log(`class SlashX < Formula
  desc "${escape(desc)}"
  homepage "${homepage}"
  url "https://github.com/${repo}/releases/download/${tag}/slash-x-${version}.tar.gz"
  sha256 "${sha256}"
  license "MIT"
  version "${version}"

  depends_on "node"

  def install
    libexec.install Dir["*"]
    (bin/"slash").write <<~EOS
      #!/bin/bash
      exec "#{Formula["node"].opt_bin}/node" "#{libexec}/dist/cli.js" "$@"
    EOS
    chmod 0755, bin/"slash"
  end

  test do
    assert_match "slash-x", shell_output("#{bin}/slash --version 2>&1", 0)
  end
end`);

function stripV(t) {
  if (!t) return "";
  return t.startsWith("v") ? t.slice(1) : t;
}

function escape(s) {
  return s.replace(/"/g, '\\"');
}
