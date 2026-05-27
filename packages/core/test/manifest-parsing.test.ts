import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";
import {
  analyzeRepository,
  inspectLocalRepository,
  renderMarkdownReport
} from "../src/index.js";

async function createManifestFixture(): Promise<string> {
  const repoPath = await mkdtemp(path.join(tmpdir(), "project-autopsy-manifests-"));
  await mkdir(path.join(repoPath, "src"), { recursive: true });
  await mkdir(path.join(repoPath, "dotnet"), { recursive: true });

  await writeFile(path.join(repoPath, "README.md"), "# Manifest Fixture\n\nA mixed manifest fixture.\n");
  await writeFile(
    path.join(repoPath, "pyproject.toml"),
    [
      "[project]",
      'name = "receipt-parser-service"',
      'version = "0.1.0"',
      'requires-python = ">=3.11"',
      "dependencies = [",
      '  "fastapi>=0.100",',
      '  "uvicorn[standard]==0.24.0"',
      "]",
      "",
      "[project.scripts]",
      'receipt-parser = "receipt_parser.__main__:main"',
      "",
      "[project.optional-dependencies]",
      "dev = [",
      '  "pytest>=8"',
      "]"
    ].join("\n")
  );
  await writeFile(
    path.join(repoPath, "requirements.txt"),
    ["requests==2.31.0", "pydantic>=2.0", "# ignored comment", ""].join("\n")
  );
  await writeFile(
    path.join(repoPath, "Cargo.toml"),
    [
      "[package]",
      'name = "changelog-summarizer"',
      'version = "0.1.0"',
      'edition = "2021"',
      "",
      "[dependencies]",
      'anyhow = "1"',
      'clap = { version = "4", features = ["derive"] }',
      "",
      "[dev-dependencies]",
      'assert_cmd = "2"'
    ].join("\n")
  );
  await writeFile(
    path.join(repoPath, "go.mod"),
    [
      "module example.com/queue-janitor",
      "",
      "go 1.22",
      "",
      "require (",
      "  github.com/rs/zerolog v1.31.0",
      "  golang.org/x/sync v0.6.0",
      ")"
    ].join("\n")
  );
  await writeFile(
    path.join(repoPath, "dotnet", "Worker.csproj"),
    [
      '<Project Sdk="Microsoft.NET.Sdk.Worker">',
      "  <PropertyGroup>",
      "    <TargetFramework>net8.0</TargetFramework>",
      "  </PropertyGroup>",
      "  <ItemGroup>",
      '    <PackageReference Include="Serilog" Version="3.1.1" />',
      '    <PackageReference Include="Microsoft.Extensions.Hosting" Version="8.0.0" />',
      "  </ItemGroup>",
      "</Project>"
    ].join("\n")
  );
  await writeFile(path.join(repoPath, "src", "index.py"), "print('fixture')\n");

  return repoPath;
}

describe("manifest parsing beyond npm", () => {
  test("normalizes Python, Rust, Go, and .NET manifest details", async () => {
    const repoPath = await createManifestFixture();

    const snapshot = await inspectLocalRepository(repoPath);

    const pyproject = snapshot.manifests.find((manifest) => manifest.path === "pyproject.toml");
    const requirements = snapshot.manifests.find((manifest) => manifest.path === "requirements.txt");
    const cargo = snapshot.manifests.find((manifest) => manifest.path === "Cargo.toml");
    const goMod = snapshot.manifests.find((manifest) => manifest.path === "go.mod");
    const csproj = snapshot.manifests.find((manifest) => manifest.path === "dotnet/Worker.csproj");

    expect(pyproject).toMatchObject({
      manager: "python",
      parsed: {
        name: "receipt-parser-service",
        version: "0.1.0",
        requiresPython: ">=3.11"
      },
      scripts: {
        "receipt-parser": "receipt_parser.__main__:main"
      },
      dependencies: {
        fastapi: ">=0.100",
        uvicorn: "==0.24.0"
      },
      devDependencies: {
        pytest: ">=8"
      }
    });
    expect(requirements?.dependencies).toMatchObject({
      requests: "==2.31.0",
      pydantic: ">=2.0"
    });
    expect(cargo).toMatchObject({
      manager: "rust",
      parsed: {
        name: "changelog-summarizer",
        version: "0.1.0",
        edition: "2021"
      },
      dependencies: {
        anyhow: "1",
        clap: "4"
      },
      devDependencies: {
        assert_cmd: "2"
      }
    });
    expect(goMod).toMatchObject({
      manager: "go",
      parsed: {
        module: "example.com/queue-janitor",
        go: "1.22"
      },
      dependencies: {
        "github.com/rs/zerolog": "v1.31.0",
        "golang.org/x/sync": "v0.6.0"
      }
    });
    expect(csproj).toMatchObject({
      manager: "dotnet",
      parsed: {
        targetFramework: "net8.0"
      },
      dependencies: {
        Serilog: "3.1.1",
        "Microsoft.Extensions.Hosting": "8.0.0"
      }
    });
    expect(snapshot.summary.technologies).toEqual(
      expect.arrayContaining([
        "anyhow",
        "clap",
        "dotnet",
        "fastapi",
        "go",
        "python",
        "rust",
        "Serilog"
      ])
    );
  });

  test("renders parsed dependency details in markdown reports", async () => {
    const repoPath = await createManifestFixture();

    const markdown = renderMarkdownReport(await analyzeRepository(repoPath));

    expect(markdown).toContain("## Dependency Snapshot");
    expect(markdown).toContain("pyproject.toml");
    expect(markdown).toContain("fastapi");
    expect(markdown).toContain("go.mod");
    expect(markdown).toContain("github.com/rs/zerolog");
  });
});
