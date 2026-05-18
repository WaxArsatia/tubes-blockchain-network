#!/usr/bin/env node

const fs = require("fs")
const path = require("path")
const { ethers } = require("ethers")
const { buildVerificationTargets, verifyTargets } = require("./verify-deployed")

const defaultRpcUrl = "http://45.126.40.107:8545"
const defaultBlockscoutUrl = "https://blockscout.denis.my.id"
const defaultIpfsApiUrl = "https://ipfs-api.denis.my.id"
const defaultIpfsGatewayUrl = "https://ipfs-gateway.denis.my.id/ipfs"
const defaultLogBlockRange = "100"
const defaultFrontendEnvPath = path.join("tubes-blockchain-fe", ".env.local")

function usage() {
  console.log(`
Redeploy BPJS contracts and update frontend env.

Usage:
  DEPLOYER_PRIVATE_KEY=0x... npm run redeploy

Optional env:
  RPC_URL=http://45.126.40.107:8545
  FRONTEND_ENV_PATH=tubes-blockchain-fe/.env.local
  VITE_BLOCKSCOUT_URL=https://blockscout.denis.my.id
  VITE_IPFS_API_URL=https://ipfs-api.denis.my.id
  VITE_IPFS_GATEWAY_URL=https://ipfs-gateway.denis.my.id/ipfs
  VITE_INSTITUTION_SALT=bpjs-remote-acceptance
  VITE_LOG_BLOCK_RANGE=100
  HARDHAT_VERIFY_NETWORK=besu-private
  SKIP_VERIFY=1
`)
}

function requirePrivateKey() {
  const privateKey = process.env.DEPLOYER_PRIVATE_KEY || process.env.PRIVATE_KEY

  if (!privateKey || !/^0x[0-9a-fA-F]{64}$/.test(privateKey)) {
    usage()
    throw new Error("Set DEPLOYER_PRIVATE_KEY to a 32-byte hex private key.")
  }

  return privateKey
}

function readArtifact(contractName) {
  const artifactPath = path.join(
    __dirname,
    "..",
    "artifacts",
    "contracts",
    `${contractName}.sol`,
    `${contractName}.json`
  )
  return JSON.parse(fs.readFileSync(artifactPath, "utf8"))
}

async function deployContract(wallet, contractName, args = []) {
  const artifact = readArtifact(contractName)
  const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, wallet)
  const contract = await factory.deploy(...args)
  const tx = contract.deploymentTransaction()

  console.log(`${contractName} deploy tx: ${tx.hash}`)
  await contract.waitForDeployment()

  const address = await contract.getAddress()
  console.log(`${contractName} address: ${address}`)

  return address
}

function writeFrontendEnv(values) {
  const frontendEnvPath = process.env.FRONTEND_ENV_PATH || defaultFrontendEnvPath
  const content = [
    `VITE_CHAIN_ID=${values.chainId}`,
    `VITE_RPC_URL=${values.rpcUrl}`,
    `VITE_BLOCKSCOUT_URL=${values.blockscoutUrl}`,
    `VITE_IPFS_API_URL=${values.ipfsApiUrl}`,
    `VITE_IPFS_GATEWAY_URL=${values.ipfsGatewayUrl}`,
    `VITE_INSTITUTION_SALT=${values.institutionSalt}`,
    `VITE_DEPLOYMENT_START_BLOCK=${values.startBlock}`,
    `VITE_LOG_BLOCK_RANGE=${values.logBlockRange}`,
    `VITE_BPJS_REGISTRY_ADDRESS=${values.registry}`,
    `VITE_MEDICAL_RECORD_ADDRESS=${values.medicalRecord}`,
    `VITE_ACCESS_MANAGER_ADDRESS=${values.accessManager}`,
    "",
  ].join("\n")

  fs.writeFileSync(path.resolve(frontendEnvPath), content)
  console.log(`Frontend env updated: ${frontendEnvPath}`)
}

async function main() {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    usage()
    return
  }

  const rpcUrl = process.env.RPC_URL || defaultRpcUrl
  const provider = new ethers.JsonRpcProvider(rpcUrl)
  const wallet = new ethers.Wallet(requirePrivateKey(), provider)
  const network = await provider.getNetwork()
  const startBlock = await provider.getBlockNumber()

  console.log(`Deploying to chain ${network.chainId.toString()} via ${rpcUrl}`)
  console.log(`Deployer: ${wallet.address}`)
  console.log(`Deployment start block: ${startBlock}`)

  const registry = await deployContract(wallet, "BPJSRegistry", [wallet.address])
  const medicalRecord = await deployContract(wallet, "MedicalRecord", [registry])
  const accessManager = await deployContract(wallet, "AccessManager", [
    registry,
    medicalRecord,
  ])

  writeFrontendEnv({
    chainId: network.chainId.toString(),
    rpcUrl,
    blockscoutUrl: process.env.VITE_BLOCKSCOUT_URL || defaultBlockscoutUrl,
    ipfsApiUrl: process.env.VITE_IPFS_API_URL || defaultIpfsApiUrl,
    ipfsGatewayUrl: process.env.VITE_IPFS_GATEWAY_URL || defaultIpfsGatewayUrl,
    institutionSalt: process.env.VITE_INSTITUTION_SALT || "bpjs-remote-acceptance",
    logBlockRange: process.env.VITE_LOG_BLOCK_RANGE || defaultLogBlockRange,
    startBlock,
    registry,
    medicalRecord,
    accessManager,
  })

  if (process.env.SKIP_VERIFY === "1") {
    console.log("Skipping contract verification because SKIP_VERIFY=1.")
  } else {
    verifyTargets(
      buildVerificationTargets(
        {
          VITE_BPJS_REGISTRY_ADDRESS: registry,
          VITE_MEDICAL_RECORD_ADDRESS: medicalRecord,
          VITE_ACCESS_MANAGER_ADDRESS: accessManager,
        },
        wallet.address
      )
    )
  }

  console.log(
    JSON.stringify(
      { chainId: network.chainId.toString(), startBlock, registry, medicalRecord, accessManager },
      null,
      2
    )
  )
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
