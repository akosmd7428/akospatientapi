function getFirstAndLastName(fullName) {
    const nameParts = fullName.trim().split(' ');

    if (nameParts.length === 1) {
        return {
            first_name: nameParts[0],
            last_name: ''
        };
    } else if (nameParts.length > 1) {
        return {
            first_name: nameParts[0],
            last_name: nameParts.slice(1).join(' ')
        };
    }
}

module.exports = {
    getFirstAndLastName
};
