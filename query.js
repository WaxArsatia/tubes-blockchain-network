const { ethers } = require("hardhat");
async function main() {
  const admin = "0xfe3b557e8fb62b89f4916b721be55ceb828dbd73";
  const bpjsAddress = "0x42699A7612A82f1d9C36148af9C77354759b210b";
  const abi = ["function hasRole(bytes32 role, address account) view returns (bool)"];
  const provider = new ethers.JsonRpcProvider("https://blockscout.denis.my.id:443/api/eth-rpc");
  const contract = new ethers.Contract(bpjsAddress, abi, provider);
  const DEFAULT_ADMIN_ROLE = ethers.ZeroHash;
  const isRole = await contract.hasRole(DEFAULT_ADMIN_ROLE, admin);
  console.log("Is Admin:", isRole);
}
main().catch(console.error);
