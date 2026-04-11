// --- STK PUSH FUNCTION ---
async function sendSTKPush(phone, amount, serviceName) {
  try {
    // Force the phone number into 254XXXXXXXXX format
    let cleanPhone = phone.replace(/\D/g, ''); // Remove any non-digits
    if (cleanPhone.startsWith('0')) {
      cleanPhone = '254' + cleanPhone.substring(1);
    } else if (cleanPhone.startsWith('7')) {
      cleanPhone = '254' + cleanPhone;
    }
    
    console.log(`🚀 Sending STK Push to: ${cleanPhone} for KES ${amount}`);

    const response = await intasend.collection().mpesaStkPush({
      phone_number: cleanPhone,
      amount: amount,
      currency: 'KES',
      api_ref: `Pay-${serviceName}`,
      narrative: `Payment for ${serviceName}`
    });
    return response;
  } catch (e) {
    console.error("STK Error Details:", e.response?.data || e.message);
    return null;
  }
}
