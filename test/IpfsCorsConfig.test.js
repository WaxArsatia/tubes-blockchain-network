const { expect } = require("chai")
const fs = require("fs")
const path = require("path")

describe("IPFS CORS configuration", function () {
  const root = path.join(__dirname, "..")
  const composeFiles = ["docker-compose.yml", "docker-compose.distributed.yml"]

  it("configures Kubo API CORS with the production frontend origin", function () {
    const exampleEnv = fs.readFileSync(path.join(root, ".env.distributed.example"), "utf8")

    expect(exampleEnv).to.include("IPFS_API_ORIGINS_JSON=")
    expect(exampleEnv).to.include("https://bpjs.denis.my.id")

    for (const file of composeFiles) {
      const content = fs.readFileSync(path.join(root, file), "utf8")

      expect(content).to.include("API.HTTPHeaders.Access-Control-Allow-Origin")
      expect(content).to.include("IPFS_API_ORIGINS_JSON")
      expect(content).to.include("https://bpjs.denis.my.id")
      expect(content).to.include('"OPTIONS"')
      expect(content).to.include('"Content-Type"')
    }
  })
})
