#!/usr/bin/env node

const fs = require("fs")
const path = require("path")
const { spawnSync } = require("child_process")
const { ethers } = require("ethers")

const defaultFrontendEnvPath = path.join("tubes-blockchain-fe", ".env.local")
const defaultNetwork = "besu-private"

function usage() {
  console.log(`
Verify already deployed BPJS contracts from frontend env.

Usage:
  DEPLOYER_PRIVATE_KEY=0x... npm run verify:deployed

Optional env:
  DEPLOYER_ADDRESS=0x...                 # Alternative to DEPLOYER_PRIVATE_KEY
  FRONTEND_ENV_PATH=tubes-blockchain-fe/.env.local
  HARDHAT_VERIFY_NETWORK=besu-private
`)
}

function parseFrontendEnv(frontendEnvPath = defaultFrontendEnvPath) {
  const content = fs.readFileSync(path.resolve(frontendEnvPath), "utf8")
  const values = {}

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim()

    if (!line || line.startsWith("#")) {
      continue
    }

    const separatorIndex = line.indexOf("=")
    if (separatorIndex === -1) {
      continue
    }

    const key = line.slice(0, separatorIndex).trim()
    const value = line.slice(separatorIndex + 1).trim()
    values[key] = value.replace(/^['"]|['"]$/g, "")
  }

  return values
}

function requireAddress(value, name) {
  if (!ethers.isAddress(value)) {
    throw new Error(`${name} must be a valid address. Received: ${value || "<empty>"}`)
  }

  return ethers.getAddress(value)
}

function resolveDeployerAddress() {
  if (process.env.DEPLOYER_ADDRESS) {
    return requireAddress(process.env.DEPLOYER_ADDRESS, "DEPLOYER_ADDRESS")
  }

  const privateKey = process.env.DEPLOYER_PRIVATE_KEY || process.env.PRIVATE_KEY

  if (!privateKey || !/^0x[0-9a-fA-F]{64}$/.test(privateKey)) {
    usage()
    throw new Error("Set DEPLOYER_PRIVATE_KEY or DEPLOYER_ADDRESS for BPJSRegistry constructor args.")
  }

  return new ethers.Wallet(privateKey).address
}

function buildVerificationTargets(values, deployerAddress) {
  const registry = requireAddress(
    values.VITE_BPJS_REGISTRY_ADDRESS,
    "VITE_BPJS_REGISTRY_ADDRESS"
  )
  const medicalRecord = requireAddress(
    values.VITE_MEDICAL_RECORD_ADDRESS,
    "VITE_MEDICAL_RECORD_ADDRESS"
  )
  const accessManager = requireAddress(
    values.VITE_ACCESS_MANAGER_ADDRESS,
    "VITE_ACCESS_MANAGER_ADDRESS"
  )

  return [
    {
      contractName: "BPJSRegistry",
      address: registry,
      constructorArgs: [requireAddress(deployerAddress, "deployerAddress")],
    },
    {
      contractName: "MedicalRecord",
      address: medicalRecord,
      constructorArgs: [registry],
    },
    {
      contractName: "AccessManager",
      address: accessManager,
      constructorArgs: [registry, medicalRecord],
    },
  ]
}

function isAlreadyVerifiedError(error) {
  const message = String(error && (error.stderr || error.message || error))
  return /already verified|already been verified/i.test(message)
}

function runHardhatVerify(target, network = defaultNetwork) {
  const args = [
    "hardhat",
    "verify",
    "--network",
    network,
    target.address,
    ...target.constructorArgs,
  ]

  console.log(`Verifying ${target.contractName}: ${target.address}`)
  const result = spawnSync("npx", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  })

  if (result.status === 0) {
    process.stdout.write(result.stdout)
    return
  }

  const error = new Error(result.stderr || result.stdout || `Hardhat verify failed with ${result.status}`)
  error.stderr = result.stderr

  if (isAlreadyVerifiedError(error)) {
    console.log(`${target.contractName} already verified.`)
    return
  }

  throw error
}

function verifyTargets(targets, options = {}) {
  const network = options.network || process.env.HARDHAT_VERIFY_NETWORK || defaultNetwork

  for (const target of targets) {
    runHardhatVerify(target, network)
  }
}

function verifyFromFrontendEnv(options = {}) {
  const frontendEnvPath =
    options.frontendEnvPath || process.env.FRONTEND_ENV_PATH || defaultFrontendEnvPath
  const values = parseFrontendEnv(frontendEnvPath)
  const deployerAddress = options.deployerAddress || resolveDeployerAddress()
  const targets = buildVerificationTargets(values, deployerAddress)

  verifyTargets(targets, options)
}

function main() {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    usage()
    return
  }

  verifyFromFrontendEnv()
}

if (require.main === module) {
  try {
    main()
  } catch (error) {
    console.error(error)
    process.exitCode = 1
  }
}

module.exports = {
  buildVerificationTargets,
  isAlreadyVerifiedError,
  parseFrontendEnv,
  resolveDeployerAddress,
  runHardhatVerify,
  verifyFromFrontendEnv,
  verifyTargets,
}
