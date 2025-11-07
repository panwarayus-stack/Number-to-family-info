// For Node.js 22.x, we can use native fetch instead of node-fetch

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle OPTIONS request for CORS
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ 
      success: false, 
      message: 'Method not allowed' 
    });
  }

  try {
    const { number, key = 'DEMOKEY' } = req.query;

    if (!number) {
      return res.status(400).json({
        success: false,
        message: 'Mobile number is required. Usage: /api/fetchdata?number=MOBILE_NUMBER'
      });
    }

    // Validate mobile number format
    const mobileRegex = /^[6-9]\d{9}$/;
    if (!mobileRegex.test(number)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid mobile number format. Please provide a valid 10-digit Indian mobile number.'
      });
    }

    // Step 1: Get mobile info from first API
    const mobileApiUrl = `https://allapiinone.vercel.app/?key=${key}&type=mobile&term=${number}`;
    console.log(`Fetching mobile data from: ${mobileApiUrl}`);
    
    const mobileResponse = await fetch(mobileApiUrl);
    
    if (!mobileResponse.ok) {
      throw new Error(`Mobile API responded with status: ${mobileResponse.status}`);
    }

    const mobileData = await mobileResponse.json();

    if (!mobileData.success || !mobileData.result || mobileData.result.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No data found for the provided mobile number'
      });
    }

    const usersData = mobileData.result;
    let familyData = null;
    let successfulAadhaar = null;
    let successfulUserData = null;
    let triedAadhaars = [];

    // Try each user's Aadhaar number until we get successful family data
    for (const userData of usersData) {
      const aadhaarNumber = userData.id_number;

      if (!aadhaarNumber) {
        console.log(`No Aadhaar number found for user: ${userData.name}`);
        continue;
      }

      // Validate Aadhaar format (12 digits)
      if (!/^\d{12}$/.test(aadhaarNumber)) {
        console.log(`Invalid Aadhaar format for user: ${userData.name}, Aadhaar: ${aadhaarNumber}`);
        continue;
      }

      try {
        // Step 2: Get family info from second API
        const familyApiUrl = `https://adhar-family.vercel.app/fetch?key=paidchx&aadhaar=${aadhaarNumber}`;
        console.log(`Fetching family data for Aadhaar: ${aadhaarNumber}`);
        
        const familyResponse = await fetch(familyApiUrl);
        
        if (!familyResponse.ok) {
          console.log(`Family API error for Aadhaar ${aadhaarNumber}: ${familyResponse.status}`);
          triedAadhaars.push({ aadhaar: aadhaarNumber, status: 'api_error', error: `HTTP ${familyResponse.status}` });
          continue;
        }

        const familyResponseData = await familyResponse.json();

        // Check if the response indicates "Ration card not found"
        if (familyResponseData.respCode === "214" || 
            familyResponseData.respMessage === "Ration card not found in IMPDS" ||
            !familyResponseData.memberDetailsList) {
          console.log(`No family data found for Aadhaar: ${aadhaarNumber}`);
          triedAadhaars.push({ aadhaar: aadhaarNumber, status: 'no_family_data', error: familyResponseData.respMessage });
          continue;
        }

        // If we get here, we have successful family data
        familyData = familyResponseData;
        successfulAadhaar = aadhaarNumber;
        successfulUserData = userData;
        triedAadhaars.push({ aadhaar: aadhaarNumber, status: 'success' });
        break; // Exit the loop once we find successful data

      } catch (error) {
        console.log(`Error fetching family data for Aadhaar ${aadhaarNumber}:`, error.message);
        triedAadhaars.push({ aadhaar: aadhaarNumber, status: 'error', error: error.message });
        continue; // Try next Aadhaar number
      }
    }

    // If no family data found for any Aadhaar number
    if (!familyData) {
      return res.status(404).json({
        success: false,
        message: 'Family data not found for any associated Aadhaar numbers',
        mobile_number: number,
        total_users_found: usersData.length,
        tried_aadhaars: triedAadhaars,
        available_users: usersData.map(user => ({
          name: user.name,
          mobile: user.mobile,
          aadhaar_number: user.id_number,
          address: formatAddress(user.address),
          father_name: user.father_name
        }))
      });
    }

    // Format the successful response
    const formattedResponse = {
      success: true,
      mobile_info: {
        mobile: successfulUserData.mobile,
        name: successfulUserData.name,
        father_name: successfulUserData.father_name,
        address: formatAddress(successfulUserData.address),
        alternate_mobile: successfulUserData.alt_mobile,
        circle: successfulUserData.circle,
        aadhaar_number: successfulAadhaar,
        email: successfulUserData.email
      },
      family_info: {
        address: familyData.address,
        district: familyData.homeDistName,
        state: familyData.homeStateName,
        pincode: extractPincode(familyData.address),
        family_members: familyData.memberDetailsList.map(member => ({
          name: member.memberName.trim(),
          relationship: member.releationship_name,
          member_id: member.memberId,
          has_uid: member.uid === 'Yes',
          relationship_code: member.relationship_code
        }))
      },
      additional_info: {
        scheme: familyData.schemeName,
        rc_id: familyData.rcId,
        district_code: familyData.districtCode,
        state_code: familyData.homeStateCode,
        total_members: familyData.memberDetailsList.length,
        allowed_onorc: familyData.allowed_onorc,
        dup_uid_status: familyData.dup_uid_status
      },
      search_info: {
        mobile_number_searched: number,
        total_users_found: usersData.length,
        users_with_aadhaar: usersData.filter(user => user.id_number).length,
        successful_aadhaar: successfulAadhaar,
        tried_aadhaars_count: triedAadhaars.length,
        all_tried_aadhaars: triedAadhaars
      },
      timestamp: new Date().toISOString()
    };

    res.status(200).json(formattedResponse);

  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
}

// Helper function to format address
function formatAddress(address) {
  if (!address) return '';
  
  try {
    const addressParts = address.split('!').filter(part => part.trim() !== '');
    return addressParts.join(', ');
  } catch (error) {
    return address;
  }
}

// Helper function to extract pincode from address
function extractPincode(address) {
  if (!address) return '';
  
  const pincodeMatch = address.match(/\b\d{6}\b/);
  return pincodeMatch ? pincodeMatch[0] : '';
}
