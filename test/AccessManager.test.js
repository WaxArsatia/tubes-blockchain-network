const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("AccessManager", function () {
  const Status = {
    Pending: 0,
    PatientApproved: 1,
    DoctorApproved: 2,
    Granted: 3,
    Rejected: 4,
    Revoked: 5,
    Expired: 6
  };
  const patientHash = ethers.id("patient-1");
  const facilityHash = ethers.id("facility-1");
  const payloadHash = ethers.id("payload");
  const recordTypeHash = ethers.id("diagnosis");
  const key = "0x1234";
  const encryptedDek = "0xabcdef";

  async function deployFixture() {
    const [admin, patient, faskes, requester, other, doctor] = await ethers.getSigners();
    const registry = await ethers.deployContract("BPJSRegistry", [admin.address]);
    await registry.registerPatient(patientHash, patient.address, 1, key);
    await registry.registerFaskes(faskes.address, facilityHash, key);
    const records = await ethers.deployContract("MedicalRecord", [await registry.getAddress()]);
    await records.connect(faskes).addRecord(patientHash, doctor.address, "ipfs://payload", payloadHash, recordTypeHash, 0);
    const manager = await ethers.deployContract("AccessManager", [await registry.getAddress(), await records.getAddress()]);
    const expiresAt = BigInt(await time.latest()) + 3600n;
    return { registry, records, manager, patient, faskes, requester, other, doctor, expiresAt };
  }

  async function createRequest(manager, requester, expiresAt) {
    await manager.connect(requester).requestAccess(1, expiresAt);
    return 1;
  }

  it("lets any wallet request access to an existing record", async function () {
    const { manager, requester, expiresAt } = await deployFixture();

    await expect(manager.connect(requester).requestAccess(1, expiresAt))
      .to.emit(manager, "AccessRequested")
      .withArgs(1, 1, requester.address, expiresAt);
    expect(await manager.getAccessStatus(1)).to.equal(Status.Pending);

    await expect(manager.connect(requester).requestAccess(99, expiresAt))
      .to.be.revertedWithCustomError(manager, "RecordNotFound");
  });

  it("rejects invalid or already expired request expiry", async function () {
    const { manager, requester } = await deployFixture();

    await expect(manager.connect(requester).requestAccess(1, 0))
      .to.be.revertedWithCustomError(manager, "InvalidExpiry");
    await expect(manager.connect(requester).requestAccess(1, await time.latest()))
      .to.be.revertedWithCustomError(manager, "InvalidExpiry");
  });

  it("enforces patient and issuer approvals", async function () {
    const { manager, patient, faskes, requester, other, expiresAt } = await deployFixture();
    await createRequest(manager, requester, expiresAt);

    await expect(manager.connect(other).approveByPatient(1))
      .to.be.revertedWithCustomError(manager, "CallerNotPatient");
    await expect(manager.connect(other).approveByDoctor(1))
      .to.be.revertedWithCustomError(manager, "CallerNotIssuerFaskes");

    await expect(manager.connect(patient).approveByPatient(1))
      .to.emit(manager, "PatientApproved")
      .withArgs(1, patient.address);
    expect(await manager.getAccessStatus(1)).to.equal(Status.PatientApproved);

    await expect(manager.connect(faskes).approveByDoctor(1))
      .to.emit(manager, "DoctorApproved")
      .withArgs(1, faskes.address);
    expect(await manager.getAccessStatus(1)).to.equal(Status.DoctorApproved);
  });

  it("allows approvals in either order before granting with an encrypted key", async function () {
    const { manager, patient, faskes, requester, expiresAt } = await deployFixture();
    await createRequest(manager, requester, expiresAt);

    await manager.connect(faskes).approveByDoctor(1);
    expect(await manager.getAccessStatus(1)).to.equal(Status.DoctorApproved);
    await manager.connect(patient).approveByPatient(1);
    expect(await manager.getAccessStatus(1)).to.equal(Status.PatientApproved);

    await expect(manager.connect(patient).submitAccessKey(1, encryptedDek))
      .to.emit(manager, "AccessGranted")
      .withArgs(1, requester.address);
    expect(await manager.getAccessStatus(1)).to.equal(Status.Granted);
    expect(await manager.connect(requester).getEncryptedAccessKey(1)).to.equal(encryptedDek);
  });

  it("supports patient and doctor rejection as terminal statuses", async function () {
    const { manager, patient, faskes, requester, expiresAt } = await deployFixture();
    await createRequest(manager, requester, expiresAt);
    await expect(manager.connect(patient).rejectByPatient(1))
      .to.emit(manager, "AccessRejected")
      .withArgs(1, patient.address);
    expect(await manager.getAccessStatus(1)).to.equal(Status.Rejected);
    await expect(manager.connect(faskes).approveByDoctor(1))
      .to.be.revertedWithCustomError(manager, "RequestTerminal");

    await manager.connect(requester).requestAccess(1, expiresAt + 10n);
    await expect(manager.connect(faskes).rejectByDoctor(2))
      .to.emit(manager, "AccessRejected")
      .withArgs(2, faskes.address);
    await expect(manager.connect(patient).submitAccessKey(2, encryptedDek))
      .to.be.revertedWithCustomError(manager, "RequestTerminal");
  });

  it("allows patient or issuer to revoke non-terminal and granted access", async function () {
    const { manager, patient, faskes, requester, other, expiresAt } = await deployFixture();
    await createRequest(manager, requester, expiresAt);

    await expect(manager.connect(other).revokeAccess(1))
      .to.be.revertedWithCustomError(manager, "CallerCannotManageAccess");
    await expect(manager.connect(patient).revokeAccess(1))
      .to.emit(manager, "AccessRevoked")
      .withArgs(1, patient.address);
    expect(await manager.getAccessStatus(1)).to.equal(Status.Revoked);

    await manager.connect(requester).requestAccess(1, expiresAt + 10n);
    await manager.connect(patient).approveByPatient(2);
    await manager.connect(faskes).approveByDoctor(2);
    await manager.connect(faskes).submitAccessKey(2, encryptedDek);
    await expect(manager.connect(faskes).revokeAccess(2))
      .to.emit(manager, "AccessRevoked")
      .withArgs(2, faskes.address);
    expect(await manager.getAccessStatus(2)).to.equal(Status.Revoked);
  });

  it("computes expired status without a transaction", async function () {
    const { manager, requester, expiresAt } = await deployFixture();
    await createRequest(manager, requester, expiresAt);

    await time.increaseTo(expiresAt + 1n);
    expect(await manager.getAccessStatus(1)).to.equal(Status.Expired);
  });

  it("rejects key submission before both approvals, after terminal states, expiry, empty key, or unauthorized caller", async function () {
    const { manager, patient, faskes, requester, other, expiresAt } = await deployFixture();
    await createRequest(manager, requester, expiresAt);

    await expect(manager.connect(patient).submitAccessKey(1, encryptedDek))
      .to.be.revertedWithCustomError(manager, "ApprovalsIncomplete");
    await manager.connect(patient).approveByPatient(1);
    await expect(manager.connect(other).submitAccessKey(1, encryptedDek))
      .to.be.revertedWithCustomError(manager, "CallerCannotSubmitKey");
    await expect(manager.connect(faskes).submitAccessKey(1, "0x"))
      .to.be.revertedWithCustomError(manager, "EmptyEncryptedDek");
    await manager.connect(faskes).approveByDoctor(1);
    await manager.connect(patient).submitAccessKey(1, encryptedDek);
    await expect(manager.connect(faskes).submitAccessKey(1, encryptedDek))
      .to.be.revertedWithCustomError(manager, "RequestTerminal");

    await manager.connect(requester).requestAccess(1, expiresAt + 10n);
    await manager.connect(patient).approveByPatient(2);
    await manager.connect(faskes).approveByDoctor(2);
    await manager.connect(patient).revokeAccess(2);
    await expect(manager.connect(faskes).submitAccessKey(2, encryptedDek))
      .to.be.revertedWithCustomError(manager, "RequestTerminal");

    await manager.connect(requester).requestAccess(1, expiresAt + 20n);
    await manager.connect(patient).approveByPatient(3);
    await manager.connect(faskes).approveByDoctor(3);
    await time.increaseTo(expiresAt + 21n);
    await expect(manager.connect(patient).submitAccessKey(3, encryptedDek))
      .to.be.revertedWithCustomError(manager, "RequestExpired");
  });
});
