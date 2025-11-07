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
      message: '❌ Method not allowed' 
    });
  }

  try {
    const { number } = req.query;

    if (!number) {
      return res.status(400).json({
        success: false,
        message: '📱 Mobile number is required. Usage: /api/fetchdata?number=MOBILE_NUMBER'
      });
    }

    // Validate mobile number format
    const mobileRegex = /^[6-9]\d{9}$/;
    if (!mobileRegex.test(number)) {
      return res.status(400).json({
        success: false,
        message: '❌ Invalid mobile number format. Please provide a valid 10-digit Indian mobile number.'
      });
    }

    // Step 1: Get mobile info from first API with timeout
    const mobileApiUrl = `https://allapiinone.vercel.app/?key=DEMOKEY&type=mobile&term=${number}`;
    
    const mobileController = new AbortController();
    const mobileTimeout = setTimeout(() => mobileController.abort(), 8000); // 8 seconds timeout
    
    const mobileResponse = await fetch(mobileApiUrl, { 
      signal: mobileController.signal 
    });
    clearTimeout(mobileTimeout);

    if (!mobileResponse.ok) {
      return res.status(200).json({
        success: false,
        message: '📱 Mobile information service is currently unavailable. Please try again later.'
      });
    }

    const mobileData = await mobileResponse.json();

    if (!mobileData.success || !mobileData.result || mobileData.result.length === 0) {
      return res.status(200).json({
        success: false,
        message: '📭 No information found for this mobile number. Please check the number and try again.'
      });
    }

    const usersData = mobileData.result;
    let familyData = null;
    let successfulUserData = null;

    // Try each user until we get successful family data
    for (const userData of usersData) {
      const aadhaarNumber = userData.id_number;

      if (!aadhaarNumber || !/^\d{12}$/.test(aadhaarNumber)) {
        continue; // Skip users without valid Aadhaar
      }

      try {
        // Step 2: Get family info from second API with timeout
        const familyApiUrl = `https://adhar-family.vercel.app/fetch?key=paidchx&aadhaar=${aadhaarNumber}`;
        
        const familyController = new AbortController();
        const familyTimeout = setTimeout(() => familyController.abort(), 8000); // 8 seconds timeout
        
        const familyResponse = await fetch(familyApiUrl, { 
          signal: familyController.signal 
        });
        clearTimeout(familyTimeout);

        if (!familyResponse.ok) continue;

        const familyResponseData = await familyResponse.json();

        // Check if we have valid family data
        if (familyResponseData.respCode === "214" || 
            familyResponseData.respMessage === "Ration card not found in IMPDS" ||
            !familyResponseData.memberDetailsList) {
          continue;
        }

        // Success - we found family data
        familyData = familyResponseData;
        successfulUserData = userData;
        break;

      } catch (error) {
        continue; // Try next user
      }
    }

    // If no family data found
    if (!familyData) {
      // But we have mobile data - return what we have
      const primaryUser = usersData[0];
      return res.status(200).json({
        success: true,
        message: '✅ Mobile information found',
        personal_info: {
          title: '👤 Personal Information',
          data: {
            name: `🧾 ${primaryUser.name}`,
            mobile_number: `📱 ${primaryUser.mobile}`,
            father_name: `👨 ${primaryUser.father_name || 'Not available'}`,
            alternate_mobile: `📞 ${primaryUser.alt_mobile || 'Not available'}`,
            telecom_circle: `📶 ${primaryUser.circle}`,
            email: `📧 ${primaryUser.email || 'Not available'}`,
            address: `🏠 ${formatAddress(primaryUser.address)}`
          }
        },
        note: '💡 Family details are currently unavailable for this number'
      });
    }

    // Get relationship emoji
    const getRelationshipEmoji = (relationship) => {
      const emojiMap = {
        'SELF': '👤',
        'HUSBAND': '👨',
        'WIFE': '👩', 
        'SON': '👦',
        'DAUGHTER': '👧',
        'FATHER': '👴',
        'MOTHER': '👵',
        'BROTHER': '👨',
        'SISTER': '👩'
      };
      return emojiMap[relationship] || '👤';
    };

    // Format the successful response
    const formattedResponse = {
      success: true,
      message: '✅ Complete information retrieved successfully',
      
      personal_info: {
        title: '👤 Personal Information',
        data: {
          name: `🧾 ${successfulUserData.name}`,
          mobile_number: `📱 ${successfulUserData.mobile}`,
          father_name: `👨 ${successfulUserData.father_name || 'Not available'}`,
          alternate_mobile: `📞 ${successfulUserData.alt_mobile || 'Not available'}`,
          telecom_circle: `📶 ${successfulUserData.circle}`,
          email: `📧 ${successfulUserData.email || 'Not available'}`,
          address: `🏠 ${formatAddress(successfulUserData.address)}`
        }
      },

      family_details: {
        title: '👨‍👩‍👧‍👦 Family Details',
        data: {
          family_address: `📍 ${familyData.address}`,
          district: `🏛️ ${familyData.homeDistName}`,
          state: `🗺️ ${familyData.homeStateName}`,
          pincode: `📮 ${extractPincode(familyData.address)}`,
          scheme: `📋 ${familyData.schemeName || 'Not available'}`,
          total_family_members: `👥 ${familyData.memberDetailsList.length} members`
        }
      },

      family_members: {
        title: '👪 Family Members List',
        members: familyData.memberDetailsList.map(member => ({
          name: `${getRelationshipEmoji(member.releationship_name)} ${member.memberName.trim()}`,
          relationship: `🔗 ${member.releationship_name}`,
          uid_status: member.uid === 'Yes' ? '✅ UID Verified' : '❌ UID Not Verified'
        }))
      },

      search_summary: {
        title: '📊 Search Summary',
        data: {
          mobile_searched: `🔍 ${number}`,
          total_family_members: `👪 ${familyData.memberDetailsList.length} members`,
          search_timestamp: `⏰ ${new Date().toLocaleString()}`
        }
      }
    };

    res.status(200).json(formattedResponse);

  } catch (error) {
    // Handle timeout and other errors gracefully
    if (error.name === 'AbortError') {
      return res.status(200).json({
        success: false,
        message: '⏰ Request timeout. Please try again in a moment.'
      });
    }

    res.status(200).json({
      success: false,
      message: '❌ Service temporarily unavailable. Please try again later.'
    });
  }
}

// Helper function to format address
function formatAddress(address) {
  if (!address) return 'Not available';
  try {
    const addressParts = address.split('!').filter(part => part.trim() !== '');
    return addressParts.join(', ');
  } catch (error) {
    return address || 'Not available';
  }
}

// Helper function to extract pincode from address
function extractPincode(address) {
  if (!address) return 'Not available';
  const pincodeMatch = address.match(/\b\d{6}\b/);
  return pincodeMatch ? pincodeMatch[0] : 'Not available';
}
