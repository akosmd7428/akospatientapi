const { DataTypes, Model } = require('sequelize');
const { sequelizeDB1 } = require('../config/sequelize');

class LabOrder extends Model {}

LabOrder.init({
    patientId: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    bookingDate: {
        type: DataTypes.STRING,
        allowNull: true
    },
    bookingTime: {
        type: DataTypes.STRING,
        allowNull: true
    },
    bookingAddress: {
        type: DataTypes.TEXT,
        allowNull: true
    },
    labId: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    labCityName: {
        type: DataTypes.STRING,
        allowNull: true
    },
    labBranchId: {
        type: DataTypes.INTEGER,
        allowNull: true
    },
    price: {
        type: DataTypes.DECIMAL,
        allowNull: false
    },
    discountApplied: DataTypes.DECIMAL,
    otherCharges: DataTypes.DECIMAL,
    totalPrice: {
        type: DataTypes.DECIMAL,
        allowNull: false
    },
    isPaid: {
        type: DataTypes.BOOLEAN,
        defaultValue: false
    },
    orderStatus: {
        type: DataTypes.ENUM,
        values: ['pending', 'confirmed', 'cancelled', 'Sample Sent', 'Completed', 'Result Awaited','Report Generated'],
        defaultValue: 'pending'
    },
    paymentStatus: {
        type: DataTypes.ENUM,
        values: ['unpaid', 'paid', 'failed','Payment Initiated'],
        defaultValue: 'unpaid'
    },
    response: {
        type: DataTypes.JSON,
        allowNull: true
    },
    uniqueBookingId: {
        type: DataTypes.STRING,
        allowNull: true
    },
    labReportURL: {
        type: DataTypes.STRING,
        allowNull: true
    },
    // noOfTest: DataTypes.INTEGER,
    isActive: {
        type: DataTypes.BOOLEAN,
        defaultValue: true
    },
    isDeleted: {
        type: DataTypes.BOOLEAN,
        defaultValue: false
    },
    labType: {
        type: DataTypes.STRING,
        allowNull: true
    },
    code: {
        type: DataTypes.STRING,
        allowNull: true
    },
     slotId: {
        type: DataTypes.INTEGER,
        allowNull: true
    },
    availableSlotId: {
        type: DataTypes.INTEGER,
        allowNull: true
    },
    is_migrated: {
        type: DataTypes.BOOLEAN,
        defaultValue: false
    },
}, {
    sequelize: sequelizeDB1, 
    tableName: 'labOrders', 
    timestamps: true 
});

module.exports = LabOrder;
