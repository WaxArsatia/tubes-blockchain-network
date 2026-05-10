const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("BPJSRegistry", function () {
  const patientHash = ethers.id("patient-1");
  const facilityHash = ethers.id("facility-1");
  const key = "0x1234";
  const newKey = "0xabcd";

  async function deployRegistryFixture() {
    const [admin, patient, faskes, auditor, other] = await ethers.getSigners();
    const registry = await ethers.deployContract("BPJSRegistry", [admin.address]);
    return { registry, admin, patient, faskes, auditor, other };
  }

  it("allows the BPJS admin to register patients, faskes, and auditors", async function () {
    const { registry, patient, faskes, auditor } = await deployRegistryFixture();

    await expect(registry.registerPatient(patientHash, patient.address, 2, key))
      .to.emit(registry, "PatientRegistered")
      .withArgs(patientHash, patient.address, 2);
    await expect(registry.registerFaskes(faskes.address, facilityHash, key))
      .to.emit(registry, "FaskesRegistered")
      .withArgs(faskes.address, facilityHash);
    await expect(registry.registerAuditor(auditor.address, key))
      .to.emit(registry, "AuditorRegistered")
      .withArgs(auditor.address);

    expect(await registry.isRegisteredPatient(patientHash)).to.equal(true);
    expect(await registry.patientWalletOf(patientHash)).to.equal(patient.address);
    expect(await registry.patientIdOfWallet(patient.address)).to.equal(patientHash);
    expect(await registry.hasRole(await registry.FASKES_ROLE(), faskes.address)).to.equal(true);
    expect(await registry.hasRole(await registry.AUDITOR_ROLE(), auditor.address)).to.equal(true);
  });

  it("rejects non-admin registration and insurance updates", async function () {
    const { registry, patient, other } = await deployRegistryFixture();

    await expect(registry.connect(other).registerPatient(patientHash, patient.address, 1, key))
      .to.be.revertedWithCustomError(registry, "AccessControlUnauthorizedAccount");
    await expect(registry.connect(other).updateInsuranceStatus(patientHash, false, 1))
      .to.be.revertedWithCustomError(registry, "AccessControlUnauthorizedAccount");
  });

  it("validates patient input and prevents duplicate patient identities", async function () {
    const { registry, patient, other } = await deployRegistryFixture();

    await expect(registry.registerPatient(ethers.ZeroHash, patient.address, 1, key))
      .to.be.revertedWithCustomError(registry, "ZeroPatientIdHash");
    await expect(registry.registerPatient(patientHash, ethers.ZeroAddress, 1, key))
      .to.be.revertedWithCustomError(registry, "ZeroWallet");
    await expect(registry.registerPatient(patientHash, patient.address, 4, key))
      .to.be.revertedWithCustomError(registry, "InvalidServiceClass");
    await expect(registry.registerPatient(patientHash, patient.address, 1, "0x"))
      .to.be.revertedWithCustomError(registry, "EmptyEncryptionPublicKey");

    await registry.registerPatient(patientHash, patient.address, 1, key);
    await expect(registry.registerPatient(patientHash, other.address, 1, key))
      .to.be.revertedWithCustomError(registry, "PatientAlreadyRegistered");
    await expect(registry.registerPatient(ethers.id("patient-2"), patient.address, 1, key))
      .to.be.revertedWithCustomError(registry, "PatientWalletAlreadyRegistered");
  });

  it("updates insurance status and rejects unknown patients", async function () {
    const { registry, patient } = await deployRegistryFixture();

    await expect(registry.updateInsuranceStatus(patientHash, true, 1))
      .to.be.revertedWithCustomError(registry, "PatientNotRegistered");

    await registry.registerPatient(patientHash, patient.address, 3, key);
    await expect(registry.updateInsuranceStatus(patientHash, false, 2))
      .to.emit(registry, "InsuranceStatusUpdated")
      .withArgs(patientHash, false, 2);
    expect(await registry.verifyInsurance(patientHash)).to.deep.equal([false, 2n]);
  });

  it("validates faskes and auditor registration", async function () {
    const { registry, faskes, auditor } = await deployRegistryFixture();

    await expect(registry.registerFaskes(ethers.ZeroAddress, facilityHash, key))
      .to.be.revertedWithCustomError(registry, "ZeroWallet");
    await expect(registry.registerFaskes(faskes.address, ethers.ZeroHash, key))
      .to.be.revertedWithCustomError(registry, "ZeroFacilityIdHash");
    await expect(registry.registerFaskes(faskes.address, facilityHash, "0x"))
      .to.be.revertedWithCustomError(registry, "EmptyEncryptionPublicKey");
    await registry.registerFaskes(faskes.address, facilityHash, key);
    await expect(registry.registerFaskes(faskes.address, ethers.id("facility-2"), key))
      .to.be.revertedWithCustomError(registry, "FaskesAlreadyRegistered");
    await expect(registry.registerFaskes(auditor.address, facilityHash, key))
      .to.be.revertedWithCustomError(registry, "FacilityAlreadyRegistered");

    await expect(registry.registerAuditor(ethers.ZeroAddress, key))
      .to.be.revertedWithCustomError(registry, "ZeroWallet");
    await expect(registry.registerAuditor(auditor.address, "0x"))
      .to.be.revertedWithCustomError(registry, "EmptyEncryptionPublicKey");
  });

  it("allows registered actors to rotate their own public key", async function () {
    const { registry, patient, faskes, auditor, other } = await deployRegistryFixture();
    await registry.registerPatient(patientHash, patient.address, 1, key);
    await registry.registerFaskes(faskes.address, facilityHash, key);
    await registry.registerAuditor(auditor.address, key);

    await expect(registry.connect(patient).updateMyEncryptionPublicKey(newKey))
      .to.emit(registry, "EncryptionPublicKeyUpdated")
      .withArgs(patient.address);
    await expect(registry.connect(faskes).updateMyEncryptionPublicKey(newKey))
      .to.emit(registry, "EncryptionPublicKeyUpdated")
      .withArgs(faskes.address);
    await expect(registry.connect(auditor).updateMyEncryptionPublicKey(newKey))
      .to.emit(registry, "EncryptionPublicKeyUpdated")
      .withArgs(auditor.address);

    expect(await registry.encryptionPublicKeyOf(patient.address)).to.equal(newKey);
    expect(await registry.encryptionPublicKeyOf(faskes.address)).to.equal(newKey);
    expect(await registry.encryptionPublicKeyOf(auditor.address)).to.equal(newKey);
    await expect(registry.connect(other).updateMyEncryptionPublicKey(newKey))
      .to.be.revertedWithCustomError(registry, "CallerNotRegistered");
  });
});
