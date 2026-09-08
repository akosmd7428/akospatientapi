const getYearsToFetch = (yearsToFetch) => {
    const currentYear = new Date().getFullYear();
    const years = [];
  
    for (let i = 0; i < yearsToFetch; i++) {
      years.push(currentYear - i);
    }
    return years;
};

module.exports = { getYearsToFetch };