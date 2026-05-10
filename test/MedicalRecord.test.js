const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("MedicalRecord", function () {
  const patientHash = ethers.id("patient-1");
  const otherPatientHash = ethers.id("patient-2");
  const facilityHash = ethers.id("facility-1");
  const payloadHash = ethers.id("payload");
  const recordTypeHash = ethers.id("diagnosis");
  const cid = "ipfs://encrypted-payload";
  const key = "0x1234";

  async function deployFixture() {
    const [admin, patient, otherPatient, faskes, other, doctor] = await ethers.getSigners();
    const registry = await ethers.deployContract("BPJSRegistry", [admin.address]);
    await registry.registerPatient(patientHash, patient.address, 1, key);
    await registry.registerPatient(otherPatientHash, otherPatient.address, 1, key);
    await registry.registerFaskes(faskes.address, facilityHash, key);
    const records = await ethers.deployContract("MedicalRecord", [await registry.getAddress()]);
    return { registry, records, patient, otherPatient, faskes, other, doctor };
  }

  it("allows only registered faskes to add active patient records", async function () {
    const { records, faskes, other, doctor } = await deployFixture();

    await expect(records.connect(other).addRecord(patientHash, doctor.address, cid, payloadHash, recordTypeHash, 0))
      .to.be.revertedWithCustomError(records, "CallerNotFaskes");

    await expect(records.connect(faskes).addRecord(patientHash, doctor.address, cid, payloadHash, recordTypeHash, 0))
      .to.emit(records, "RecordAdded")
      .withArgs(1, patientHash, faskes.address, doctor.address);
  });

  it("rejects unknown or inactive patients", async function () {
    const { registry, records, faskes, doctor } = await deployFixture();

    await expect(records.connect(faskes).addRecord(ethers.id("unknown"), doctor.address, cid, payloadHash, recordTypeHash, 0))
      .to.be.revertedWithCustomError(records, "PatientNotRegistered");

    await registry.updateInsuranceStatus(patientHash, false, 1);
    await expect(records.connect(faskes).addRecord(patientHash, doctor.address, cid, payloadHash, recordTypeHash, 0))
      .to.be.revertedWithCustomError(records, "InactiveInsurance");
  });

  it("validates record metadata input", async function () {
    const { records, faskes, doctor } = await deployFixture();

    await expect(records.connect(faskes).addRecord(patientHash, ethers.ZeroAddress, cid, payloadHash, recordTypeHash, 0))
      .to.be.revertedWithCustomError(records, "ZeroDoctorWallet");
    await expect(records.connect(faskes).addRecord(patientHash, doctor.address, "", payloadHash, recordTypeHash, 0))
      .to.be.revertedWithCustomError(records, "EmptyEncryptedPayloadCid");
    await expect(records.connect(faskes).addRecord(patientHash, doctor.address, cid, ethers.ZeroHash, recordTypeHash, 0))
      .to.be.revertedWithCustomError(records, "ZeroEncryptedPayloadHash");
    await expect(records.connect(faskes).addRecord(patientHash, doctor.address, cid, payloadHash, ethers.ZeroHash, 0))
      .to.be.revertedWithCustomError(records, "ZeroRecordTypeHash");
  });

  it("stores metadata and indexes records by patient", async function () {
    const { records, faskes, doctor } = await deployFixture();

    await records.connect(faskes).addRecord(patientHash, doctor.address, cid, payloadHash, recordTypeHash, 0);
    const record = await records.getRecordMetadata(1);
    expect(record.recordId).to.equal(1n);
    expect(record.patientIdHash).to.equal(patientHash);
    expect(record.issuerFaskes).to.equal(faskes.address);
    expect(record.doctorWallet).to.equal(doctor.address);
    expect(record.encryptedPayloadCid).to.equal(cid);
    expect(record.encryptedPayloadHash).to.equal(payloadHash);
    expect(record.recordTypeHash).to.equal(recordTypeHash);
    expect(record.previousRecordId).to.equal(0n);
    expect(record.active).to.equal(true);
    expect(await records.getPatientRecords(patientHash)).to.deep.equal([1n]);
  });

  it("supports correction links only for existing records owned by the same patient", async function () {
    const { records, faskes, doctor } = await deployFixture();

    await expect(records.connect(faskes).addRecord(patientHash, doctor.address, cid, payloadHash, recordTypeHash, 99))
      .to.be.revertedWithCustomError(records, "PreviousRecordNotFound");

    await records.connect(faskes).addRecord(otherPatientHash, doctor.address, cid, payloadHash, recordTypeHash, 0);
    await expect(records.connect(faskes).addRecord(patientHash, doctor.address, cid, payloadHash, recordTypeHash, 1))
      .to.be.revertedWithCustomError(records, "PreviousRecordPatientMismatch");

    await records.connect(faskes).addRecord(patientHash, doctor.address, cid, payloadHash, recordTypeHash, 0);
    await records.connect(faskes).addRecord(patientHash, doctor.address, "ipfs://correction", ethers.id("payload-2"), recordTypeHash, 2);
    const correction = await records.getRecordMetadata(3);
    expect(correction.previousRecordId).to.equal(2n);
    expect(await records.getPatientRecords(patientHash)).to.deep.equal([2n, 3n]);
  });
});
