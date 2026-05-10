const fs = require("fs")
const os = require("os")
const path = require("path")
const { expect } = require("chai")

const {
  buildVerificationTargets,
  isAlreadyVerifiedError,
  parseFrontendEnv,
} = require("../scripts/verify-deployed")

describe("deployment verification scripts", function () {
  it("builds verification targets from frontend env addresses", function () {
    const values = {
      VITE_BPJS_REGISTRY_ADDRESS: "0x1111111111111111111111111111111111111111",
      VITE_MEDICAL_RECORD_ADDRESS: "0x2222222222222222222222222222222222222222",
      VITE_ACCESS_MANAGER_ADDRESS: "0x3333333333333333333333333333333333333333",
    }
    const deployer = "0x4444444444444444444444444444444444444444"

    expect(buildVerificationTargets(values, deployer)).to.deep.equal([
      {
        contractName: "BPJSRegistry",
        address: values.VITE_BPJS_REGISTRY_ADDRESS,
        constructorArgs: [deployer],
      },
      {
        contractName: "MedicalRecord",
        address: values.VITE_MEDICAL_RECORD_ADDRESS,
        constructorArgs: [values.VITE_BPJS_REGISTRY_ADDRESS],
      },
      {
        contractName: "AccessManager",
        address: values.VITE_ACCESS_MANAGER_ADDRESS,
        constructorArgs: [
          values.VITE_BPJS_REGISTRY_ADDRESS,
          values.VITE_MEDICAL_RECORD_ADDRESS,
        ],
      },
    ])
  })

  it("parses frontend env local values without Vite", function () {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bpjs-env-"))
    const envPath = path.join(dir, ".env.local")
    fs.writeFileSync(
      envPath,
      [
        "VITE_CHAIN_ID=1337",
        "VITE_BPJS_REGISTRY_ADDRESS=0x1111111111111111111111111111111111111111",
        "VITE_MEDICAL_RECORD_ADDRESS=0x2222222222222222222222222222222222222222",
        "VITE_ACCESS_MANAGER_ADDRESS=0x3333333333333333333333333333333333333333",
        "",
      ].join("\n")
    )

    expect(parseFrontendEnv(envPath)).to.include({
      VITE_CHAIN_ID: "1337",
      VITE_BPJS_REGISTRY_ADDRESS: "0x1111111111111111111111111111111111111111",
      VITE_MEDICAL_RECORD_ADDRESS: "0x2222222222222222222222222222222222222222",
      VITE_ACCESS_MANAGER_ADDRESS: "0x3333333333333333333333333333333333333333",
    })
  })

  it("recognizes already verified explorer responses", function () {
    expect(isAlreadyVerifiedError(new Error("Source code already verified"))).to.equal(true)
    expect(isAlreadyVerifiedError(new Error("Contract source code already verified"))).to.equal(
      true
    )
    expect(isAlreadyVerifiedError(new Error("Invalid constructor arguments"))).to.equal(false)
  })
})
